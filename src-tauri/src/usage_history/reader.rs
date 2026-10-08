//! Filesystem access for transcript scanning.
//!
//! Transcripts are append-only, so a parse reports the byte position it
//! stopped at and a later scan of the same file resumes from there, parsing
//! only the appended bytes. That keeps a warm scan cheap while a session is
//! actively writing a multi-hundred-megabyte rollout.

use std::fs::File;
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};

use super::parse::{
    might_carry_usage, parse_claude_line, parse_codex_line, parse_grok_line, CodexScanState, Provider,
    UsageRecord,
};

pub(crate) struct TranscriptFile {
    pub path: PathBuf,
    pub size: u64,
    pub mtime_ms: i64,
}

/// Where a parse stopped, with enough state to continue from there.
///
/// The guard hash fingerprints the bytes immediately before `resume_offset`.
/// A resume only proceeds when those bytes still match: a rotated or
/// rewritten file mis-parsed from the middle would corrupt usage totals.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub(crate) struct ParsePosition {
    pub resume_offset: u64,
    pub guard_length: u32,
    pub guard_hash: u32,
    /// Codex reducer state as of `resume_offset`; `None` for Claude.
    pub codex_state: Option<CodexScanState>,
}

pub(crate) struct ParseResult {
    pub records: Vec<UsageRecord>,
    /// Records from a trailing segment the writer has not newline-terminated
    /// yet. Kept apart because `position` excludes that segment: the next scan
    /// re-reads it once the line is finished.
    pub tail_records: Vec<UsageRecord>,
    pub position: ParsePosition,
    pub resumed: bool,
}

/// 64 bytes of JSONL tail is ample to distinguish a replaced file.
const GUARD_LENGTH: u64 = 64;

fn fnv1a32(bytes: &[u8]) -> u32 {
    let mut hash: u32 = 0x811c_9dc5;
    for byte in bytes {
        hash ^= u32::from(*byte);
        hash = hash.wrapping_mul(0x0100_0193);
    }
    hash
}

fn mtime_ms(metadata: &std::fs::Metadata) -> i64 {
    metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

/// Lists `.jsonl` transcripts under `root` modified at or after `since_ms`,
/// restricted to one basename when `file_name` is set: Grok sessions keep
/// multi-megabyte chat and event logs beside the `updates.jsonl` that carries
/// usage.
///
/// Errors on individual entries are swallowed: session files rotate and get
/// removed mid-walk, and a partial listing beats failing the scan. Directory
/// symlinks are not followed, so a link cycle cannot hang the walk.
pub(crate) fn list_transcript_files(
    root: &Path,
    since_ms: i64,
    file_name: Option<&str>,
) -> Vec<TranscriptFile> {
    let mut found = Vec::new();
    let mut pending = vec![root.to_path_buf()];
    while let Some(dir) = pending.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let Ok(file_type) = entry.file_type() else { continue };
            let path = entry.path();
            if file_type.is_dir() {
                pending.push(path);
                continue;
            }
            if path.extension().and_then(|ext| ext.to_str()) != Some("jsonl") {
                continue;
            }
            if file_name.is_some_and(|name| entry.file_name() != name) {
                continue;
            }
            let Ok(metadata) = std::fs::metadata(&path) else { continue };
            if !metadata.is_file() {
                continue;
            }
            let mtime = mtime_ms(&metadata);
            if mtime >= since_ms {
                found.push(TranscriptFile { path, size: metadata.len(), mtime_ms: mtime });
            }
        }
    }
    found
}

fn read_window(file: &mut File, end: u64, length: u64) -> Option<Vec<u8>> {
    let mut window = vec![0u8; length as usize];
    file.seek(SeekFrom::Start(end - length)).ok()?;
    file.read_exact(&mut window).ok()?;
    Some(window)
}

fn guard_matches(file: &mut File, position: &ParsePosition) -> bool {
    let length = u64::from(position.guard_length);
    if length == 0 || length > GUARD_LENGTH || length > position.resume_offset {
        return false;
    }
    read_window(file, position.resume_offset, length)
        .is_some_and(|window| fnv1a32(&window) == position.guard_hash)
}

fn parse_line(
    bytes: &[u8],
    provider: Provider,
    state: &mut CodexScanState,
    out: &mut Vec<UsageRecord>,
) {
    let bytes = bytes.strip_suffix(b"\r").unwrap_or(bytes);
    if !might_carry_usage(bytes, provider) {
        return;
    }
    let Ok(line) = std::str::from_utf8(bytes) else { return };
    let record = match provider {
        Provider::Claude => parse_claude_line(line),
        Provider::Codex => parse_codex_line(line, state),
        Provider::Grok => return parse_grok_line(line, out),
        Provider::Devin | Provider::OpenCode | Provider::Antigravity => None,
    };
    if let Some(record) = record {
        out.push(record);
    }
}

/// Streams one transcript and returns its usage records, or `None` when the
/// file could not be read.
///
/// The distinction matters to the cache: an empty transcript is a stable
/// fact worth memoising, while a transient read failure memoised under the
/// same `(size, mtime)` would drop that file's usage until it next changes.
///
/// With `resume_from`, parsing continues from that position when its guard
/// bytes still match; otherwise the whole file is re-parsed and `resumed` is
/// `false`.
pub(crate) fn read_transcript_records(
    path: &Path,
    provider: Provider,
    resume_from: Option<&ParsePosition>,
) -> Option<ParseResult> {
    let mut file = File::open(path).ok()?;

    let mut state = CodexScanState::default();
    let mut start = 0u64;
    let mut resumed = false;
    if let Some(position) = resume_from {
        let state_ok = provider != Provider::Codex || position.codex_state.is_some();
        if position.resume_offset > 0 && state_ok && guard_matches(&mut file, position) {
            if let Some(saved) = &position.codex_state {
                state = saved.clone();
            }
            start = position.resume_offset;
            resumed = true;
        }
    }
    file.seek(SeekFrom::Start(start)).ok()?;

    let mut reader = BufReader::with_capacity(256 * 1024, file);
    let mut records = Vec::new();
    let mut tail_records = Vec::new();
    let mut offset = start;
    let mut line = Vec::with_capacity(16 * 1024);
    loop {
        line.clear();
        let read = reader.read_until(b'\n', &mut line).ok()?;
        if read == 0 {
            break;
        }
        if line.last() == Some(&b'\n') {
            parse_line(&line[..line.len() - 1], provider, &mut state, &mut records);
            offset += read as u64;
        } else {
            // A writer may still be appending to this segment; counting a half
            // record now and its full form later would double count.
            let mut tail_state = state.clone();
            parse_line(&line, provider, &mut tail_state, &mut tail_records);
            break;
        }
    }

    let mut file = reader.into_inner();
    let guard_length = GUARD_LENGTH.min(offset);
    let guard_hash = if guard_length > 0 {
        fnv1a32(&read_window(&mut file, offset, guard_length)?)
    } else {
        0
    };

    Some(ParseResult {
        records,
        tail_records,
        position: ParsePosition {
            resume_offset: offset,
            guard_length: guard_length as u32,
            guard_hash,
            codex_state: (provider == Provider::Codex).then_some(state),
        },
        resumed,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn claude_line(id: &str, output: u64) -> String {
        format!(
            r#"{{"type":"assistant","timestamp":"2026-09-01T12:00:00Z","sessionId":"s","requestId":"r-{id}","message":{{"id":"{id}","model":"claude-sonnet-4-5","usage":{{"input_tokens":1,"output_tokens":{output}}}}}}}"#
        )
    }

    fn temp_file(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("usage-history-{}-{name}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir.join("session.jsonl")
    }

    #[test]
    fn resumes_from_appended_bytes_and_keeps_tail_apart() {
        let path = temp_file("resume");
        std::fs::write(&path, format!("{}\n{}", claude_line("a", 1), claude_line("b", 2))).unwrap();

        let first = read_transcript_records(&path, Provider::Claude, None).unwrap();
        assert_eq!(first.records.len(), 1);
        assert_eq!(first.tail_records.len(), 1);
        assert!(!first.resumed);

        let mut file = std::fs::OpenOptions::new().append(true).open(&path).unwrap();
        writeln!(file).unwrap();
        writeln!(file, "{}", claude_line("c", 3)).unwrap();
        drop(file);

        let second = read_transcript_records(&path, Provider::Claude, Some(&first.position)).unwrap();
        assert!(second.resumed);
        let outputs: Vec<u64> = second.records.iter().map(|r| r.tokens[3]).collect();
        assert_eq!(outputs, vec![2, 3]);
        assert!(second.tail_records.is_empty());
        std::fs::remove_dir_all(path.parent().unwrap()).ok();
    }

    #[test]
    fn lists_only_the_named_transcript_when_asked() {
        let session = temp_file("grok").parent().unwrap().join("%2Ftmp/019fec1a");
        std::fs::create_dir_all(&session).unwrap();
        for name in ["updates.jsonl", "chat_history.jsonl", "events.jsonl"] {
            std::fs::write(session.join(name), "{}\n").unwrap();
        }
        let root = session.parent().unwrap().parent().unwrap();
        assert_eq!(list_transcript_files(root, 0, None).len(), 3);
        let named = list_transcript_files(root, 0, Some("updates.jsonl"));
        assert_eq!(named.len(), 1);
        assert!(named[0].path.ends_with("updates.jsonl"));
        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn rewritten_file_restarts_from_zero() {
        let path = temp_file("rewrite");
        std::fs::write(&path, format!("{}\n", claude_line("a", 1))).unwrap();
        let first = read_transcript_records(&path, Provider::Claude, None).unwrap();

        std::fs::write(&path, format!("{}\n{}\n", claude_line("x", 7), claude_line("y", 8))).unwrap();
        let second = read_transcript_records(&path, Provider::Claude, Some(&first.position)).unwrap();
        assert!(!second.resumed);
        assert_eq!(second.records.len(), 2);
        std::fs::remove_dir_all(path.parent().unwrap()).ok();
    }
}
