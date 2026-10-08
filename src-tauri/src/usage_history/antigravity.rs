//! Antigravity usage, read from the per-conversation SQLite databases its CLI
//! and IDE keep under `~/.gemini/antigravity*/conversations` (ported from
//! t3code's `antigravityUsageReader`).
//!
//! Usage is protobuf metadata beside the conversation, never its text:
//! `gen_metadata` holds one row per model generation and `steps.metadata`
//! one per trajectory step, each with a usage message and any retries' usage.
//! A generation and its step report the same request, so candidates sharing
//! a response, provider, or message id merge into one record, across
//! databases too, keeping the largest count per token field.
//!
//! Parsed databases are memoised while the database and its `-wal` sidecar
//! keep the same `(size, mtime, ctime)`: new rows land in the WAL without
//! touching the main file until a checkpoint.

use std::collections::{HashMap, HashSet};
use std::os::unix::fs::MetadataExt;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::parse::{fnv1a64, total_tokens, Provider, Tokens, UsageRecord};
use super::{home, sqlite};

/// One usage reading before cross-database merging.
#[derive(Clone, Serialize, Deserialize)]
struct Candidate {
    #[serde(rename = "r")]
    record: UsageRecord,
    /// Hashed response/provider/message ids that identify the request.
    #[serde(rename = "k")]
    keys: Vec<u64>,
    /// 2: the metadata's own timestamp; 1: the trajectory's; 0: file mtime.
    #[serde(rename = "q")]
    timestamp_quality: u8,
}

#[derive(Clone, Default, Serialize, Deserialize)]
struct DatabaseEntry {
    fingerprint: String,
    candidates: Vec<Candidate>,
}

#[derive(Clone, Default, Serialize, Deserialize)]
pub(super) struct AntigravityCache {
    databases: HashMap<String, DatabaseEntry>,
    /// Database paths in walk order, which decides merge ownership.
    order: Vec<String>,
    /// Merged records, rebuilt whenever a database changes.
    pub records: Vec<UsageRecord>,
}

impl AntigravityCache {
    pub(super) fn databases_with_history(&self) -> u64 {
        self.databases.values().filter(|db| !db.candidates.is_empty()).count() as u64
    }
}

pub(super) enum AntigravityRead {
    /// No Antigravity history on this Mac.
    Missing,
    /// A database could not be read; its cached records still stand.
    Failed,
    Ok,
}

/// Conversation directories for the Antigravity CLI and IDE, falling back to
/// the root itself when it has no `conversations` subdirectory.
pub(super) fn antigravity_dirs() -> Vec<PathBuf> {
    let Some(home) = home() else { return Vec::new() };
    let roots = ["antigravity", "antigravity-cli", "antigravity-ide", "antigravity-backup"]
        .iter()
        .map(|name| home.join(".gemini").join(name))
        .chain([home.join(".config/antigravity")]);
    let mut seen = HashSet::new();
    roots
        .map(|root| {
            let root = std::fs::canonicalize(&root).unwrap_or(root);
            let nested = root.join("conversations");
            if nested.is_dir() {
                std::fs::canonicalize(&nested).unwrap_or(nested)
            } else {
                root
            }
        })
        .filter(|dir| seen.insert(dir.clone()))
        .collect()
}

/* -------------------------------------------------------------------------- */
/* Protobuf                                                                   */
/* -------------------------------------------------------------------------- */

#[derive(Clone, Copy)]
enum Field<'a> {
    Varint(u64),
    Bytes(&'a [u8]),
}

/// A decoded message: field number to its values in wire order. Fixed-width
/// fields are skipped; nothing read here uses them.
struct Fields<'a>(HashMap<u64, Vec<Field<'a>>>);

/// Decodes one protobuf message without a schema. Malformed input is an
/// error, which fails the database rather than mis-reading it.
fn decode(bytes: &[u8]) -> Result<Fields<'_>, ()> {
    let mut offset = 0;
    let varint = |offset: &mut usize| -> Result<u64, ()> {
        let mut value = 0u64;
        for shift in (0..70).step_by(7) {
            let byte = *bytes.get(*offset).ok_or(())?;
            *offset += 1;
            if shift == 63 && byte > 1 {
                return Err(());
            }
            value |= u64::from(byte & 0x7f) << shift;
            if byte < 0x80 {
                return Ok(value);
            }
        }
        Err(())
    };
    let mut fields: HashMap<u64, Vec<Field>> = HashMap::new();
    while offset < bytes.len() {
        let tag = varint(&mut offset)?;
        let number = tag >> 3;
        if number == 0 {
            return Err(());
        }
        let value = match tag & 7 {
            0 => Field::Varint(varint(&mut offset)?),
            wire @ (1 | 2 | 5) => {
                let length = match wire {
                    1 => 8,
                    5 => 4,
                    _ => usize::try_from(varint(&mut offset)?).map_err(|_| ())?,
                };
                let end = offset.checked_add(length).filter(|end| *end <= bytes.len()).ok_or(())?;
                let slice = &bytes[offset..end];
                offset = end;
                if wire != 2 {
                    continue;
                }
                Field::Bytes(slice)
            }
            _ => return Err(()),
        };
        fields.entry(number).or_default().push(value);
    }
    Ok(Fields(fields))
}

/// Values past 2^53 come from unrelated fields; t3code reads them as zero.
const MAX_SAFE_INTEGER: u64 = (1 << 53) - 1;

impl<'a> Fields<'a> {
    fn number(&self, key: u64) -> u64 {
        match self.0.get(&key).and_then(|values| values.first()) {
            Some(Field::Varint(value)) if *value <= MAX_SAFE_INTEGER => *value,
            _ => 0,
        }
    }

    fn bytes(&self, key: u64) -> Option<&'a [u8]> {
        match self.0.get(&key)?.first()? {
            Field::Bytes(bytes) => Some(bytes),
            Field::Varint(_) => None,
        }
    }

    fn nested(&self, key: u64) -> Result<Fields<'a>, ()> {
        self.bytes(key).map_or(Ok(Fields(HashMap::new())), decode)
    }

    fn text(&self, key: u64) -> Result<&'a str, ()> {
        self.bytes(key).map_or(Ok(""), |bytes| std::str::from_utf8(bytes).map(str::trim).map_err(|_| ()))
    }

    /// A `google.protobuf.Timestamp`, in epoch milliseconds.
    fn timestamp_ms(&self) -> Option<i64> {
        let seconds = self.number(1);
        (seconds > 0).then(|| (seconds * 1000 + self.number(2) / 1_000_000) as i64)
    }
}

/* -------------------------------------------------------------------------- */
/* Models                                                                     */
/* -------------------------------------------------------------------------- */

/// Antigravity's numeric model ids, for usage that names no model.
fn model_for_id(id: u64) -> Option<&'static str> {
    Some(match id {
        246 => "gemini-2.5-pro",
        312 => "gemini-2.5-flash",
        313 | 329 => "gemini-2.5-flash-thinking",
        330 => "gemini-2.5-flash-lite",
        281 | 282 => "claude-sonnet-4",
        290 | 291 => "claude-opus-4",
        333 | 334 => "claude-sonnet-4-5",
        340 | 341 => "claude-haiku-4-5",
        1026 => "claude-opus-4-6",
        1035 => "claude-sonnet-4-6",
        1016 | 1036 | 1037 => "gemini-3.1-pro",
        1018 | 1047 | 1084 => "gemini-3-flash-preview",
        _ => return None,
    })
}

/// Turns a display name into a rate-table slug: `Gemini 3 Pro (High)` to
/// `gemini-3-pro`, `Claude 4.5 Sonnet` to `claude-sonnet-4-5`.
fn model_name(name: &str, id: u64) -> String {
    if name.is_empty() {
        return match model_for_id(id) {
            Some(model) => model.to_string(),
            None if id > 0 => format!("antigravity-model-{id}"),
            None => String::new(),
        };
    }
    let mut normalized = name.to_lowercase();
    if normalized.ends_with(')') {
        if let Some(open) = normalized.rfind('(') {
            normalized.truncate(open);
        }
    }
    let normalized = normalized.trim().replace(' ', "-");
    let Some(rest) = normalized.strip_prefix("claude-") else { return normalized };
    reorder_claude_version(rest).unwrap_or_else(|| normalized.clone()).replace('.', "-")
}

/// `4.5-sonnet…` to `claude-sonnet-4.5…`: older display names put the
/// version first, while rate tables put it last.
fn reorder_claude_version(rest: &str) -> Option<String> {
    let after_major = rest.strip_prefix('4')?;
    let minor_digits =
        after_major.strip_prefix('.').map_or(0, |minor| minor.bytes().take_while(u8::is_ascii_digit).count());
    let (version, after) = rest.split_at(if minor_digits > 0 { 2 + minor_digits } else { 1 });
    let after = after.strip_prefix('-')?;
    ["sonnet", "opus", "haiku"].iter().find_map(|family| {
        let tail = after.strip_prefix(family)?;
        Some(format!("claude-{family}-{version}{tail}"))
    })
}

/* -------------------------------------------------------------------------- */
/* Databases                                                                  */
/* -------------------------------------------------------------------------- */

struct Metadata<'a> {
    model: String,
    timestamp_ms: Option<i64>,
    usages: Vec<Fields<'a>>,
}

/// Reads a `gen_metadata.data` (`step == false`) or `steps.metadata` blob.
fn metadata(bytes: &[u8], step: bool) -> Result<Metadata<'_>, ()> {
    let root = decode(bytes)?;
    if !step && root.bytes(1).is_none() {
        return Err(());
    }
    let data = if step { root } else { root.nested(1)? };
    // A generation keeps its model fields on itself; a step nests them.
    let step_model;
    let model = if step {
        step_model = data.nested(24)?;
        &step_model
    } else {
        &data
    };
    let mut usages = Vec::new();
    if let Some(usage) = data.bytes(if step { 9 } else { 4 }) {
        usages.push(decode(usage)?);
    }
    for retry in data.0.get(&if step { 28 } else { 17 }).into_iter().flatten() {
        let Field::Bytes(retry) = retry else { return Err(()) };
        if let Some(usage) = decode(retry)?.bytes(2) {
            usages.push(decode(usage)?);
        }
    }
    let name = match model.text(if step { 12 } else { 19 })? {
        "" => model.text(if step { 8 } else { 21 })?,
        name => name,
    };
    let timestamp_ms = if step {
        match data.nested(8)?.timestamp_ms() {
            Some(ms) => Some(ms),
            None => data.nested(1)?.timestamp_ms(),
        }
    } else {
        data.nested(9)?.nested(4)?.timestamp_ms()
    };
    Ok(Metadata { model: model_name(name, model.number(if step { 1 } else { 3 })), timestamp_ms, usages })
}

fn hex_decode(text: &str) -> Option<Vec<u8>> {
    let digit = |byte: u8| (byte as char).to_digit(16);
    let (pairs, rest) = text.as_bytes().as_chunks::<2>();
    if !rest.is_empty() {
        return None;
    }
    pairs.iter().map(|&[high, low]| Some((digit(high)? * 16 + digit(low)?) as u8)).collect()
}

const TABLES_QUERY: &str = "SELECT name FROM sqlite_master WHERE type = 'table';";

/// Blobs come back hex-encoded, one tab-separated row per line.
fn rows_query(tables: &HashSet<&str>) -> String {
    let mut sql = String::from("BEGIN;\n");
    if tables.contains("gen_metadata") {
        sql.push_str("SELECT 'gen', idx, hex(data) FROM gen_metadata ORDER BY idx;\n");
    }
    if tables.contains("trajectory_metadata_blob") {
        sql.push_str("SELECT 'trajectory', hex(data) FROM trajectory_metadata_blob;\n");
    }
    if tables.contains("steps") {
        sql.push_str(
            "SELECT 'step', idx, hex(metadata) FROM steps WHERE metadata IS NOT NULL ORDER BY idx;\n",
        );
    }
    sql.push_str("COMMIT;");
    sql
}

fn identity(field: u64, id: &str) -> u64 {
    fnv1a64(&[b"antigravity", &field.to_le_bytes(), id.as_bytes()])
}

/// Turns one database's query output into candidates. `session_id` is the
/// database's file stem; `fallback_ms` its mtime.
fn parse_rows(stdout: &str, session_id: &str, fallback_ms: i64) -> Result<Vec<Candidate>, ()> {
    let mut generations: Vec<(i64, Vec<u8>)> = Vec::new();
    let mut steps: Vec<(i64, Vec<u8>)> = Vec::new();
    let mut trajectory_ms = None;
    for line in stdout.lines() {
        let fields: Vec<&str> = line.split('\t').collect();
        match fields.as_slice() {
            ["gen", idx, blob] | ["step", idx, blob] => {
                let row = (idx.parse::<i64>().map_err(|_| ())?, hex_decode(blob).ok_or(())?);
                if fields[0] == "gen" {
                    generations.push(row)
                } else {
                    steps.push(row)
                }
            }
            ["trajectory", blob] => {
                let bytes = hex_decode(blob).ok_or(())?;
                if trajectory_ms.is_none() {
                    trajectory_ms = decode(&bytes)?.nested(2)?.timestamp_ms();
                }
            }
            _ => {}
        }
    }

    let generations: Vec<(i64, Metadata)> = generations
        .iter()
        .map(|(idx, blob)| Ok((*idx, metadata(blob, false)?)))
        .collect::<Result<_, ()>>()?;
    let steps: Vec<(i64, Metadata)> =
        steps.iter().map(|(idx, blob)| Ok((*idx, metadata(blob, true)?))).collect::<Result<_, ()>>()?;
    let generation_models: HashMap<i64, &str> =
        generations.iter().map(|(idx, entry)| (*idx, entry.model.as_str())).collect();

    let mut candidates = Vec::new();
    for (source, entries) in [("step", &steps), ("generation", &generations)] {
        for (index, (idx, entry)) in entries.iter().enumerate() {
            for (usage_index, usage) in entry.usages.iter().enumerate() {
                let output = usage.number(3).max(usage.number(9) + usage.number(10));
                let tokens: Tokens =
                    [usage.number(2), usage.number(5), usage.number(4), output, output.min(usage.number(9))];
                if total_tokens(&tokens) == 0 {
                    continue;
                }
                let mut keys = Vec::new();
                for field in [11, 12, 7] {
                    let id = usage.text(field)?;
                    if !id.is_empty() {
                        keys.push(identity(field, id));
                    }
                }
                let model_id = usage.number(1);
                let model = model_for_id(model_id)
                    .map(str::to_string)
                    .or_else(|| Some(entry.model.clone()).filter(|m| !m.is_empty()))
                    .or_else(|| {
                        let generation = generation_models.get(idx).filter(|_| source == "step")?;
                        Some(generation.to_string()).filter(|m| !m.is_empty())
                    })
                    .or_else(|| Some(model_name("", model_id)).filter(|m| !m.is_empty()))
                    .unwrap_or_else(|| "antigravity-unknown".into());
                let fallback_key = format!("{session_id}:{source}:{index}:{usage_index}");
                candidates.push(Candidate {
                    record: UsageRecord {
                        provider: Provider::Antigravity,
                        timestamp_ms: entry.timestamp_ms.or(trajectory_ms).unwrap_or(fallback_ms),
                        model,
                        session_id: session_id.to_string(),
                        tokens,
                        reported_cost_usd: None,
                        fast: false,
                        dedupe_key: Some(
                            keys.first()
                                .copied()
                                .unwrap_or_else(|| fnv1a64(&[b"antigravity", fallback_key.as_bytes()])),
                        ),
                    },
                    keys,
                    timestamp_quality: if entry.timestamp_ms.is_some() {
                        2
                    } else if trajectory_ms.is_some() {
                        1
                    } else {
                        0
                    },
                });
            }
        }
    }
    Ok(candidates)
}

fn read_database(path: &Path, fallback_ms: i64) -> Option<Vec<Candidate>> {
    let tables = sqlite::query(path, TABLES_QUERY)?;
    let tables: HashSet<&str> = tables.lines().collect();
    if !tables.contains("gen_metadata") && !tables.contains("steps") {
        return None;
    }
    let stdout = sqlite::query(path, &rows_query(&tables))?;
    let session_id = path.file_stem().and_then(|stem| stem.to_str()).unwrap_or("");
    parse_rows(&stdout, session_id, fallback_ms).ok()
}

/* -------------------------------------------------------------------------- */
/* Merging                                                                    */
/* -------------------------------------------------------------------------- */

struct Group {
    record: UsageRecord,
    timestamp_quality: u8,
    parent: usize,
    size: usize,
    /// The earliest candidate in the group, whose model and session win.
    owner: usize,
}

fn find(groups: &mut [Group], mut index: usize) -> usize {
    let mut root = index;
    while groups[root].parent != root {
        root = groups[root].parent;
    }
    while index != root {
        let parent = groups[index].parent;
        groups[index].parent = root;
        index = parent;
    }
    root
}

fn union(groups: &mut [Group], left: usize, right: usize) {
    let (mut a, mut b) = (find(groups, left), find(groups, right));
    if a == b {
        return;
    }
    if groups[a].size < groups[b].size {
        std::mem::swap(&mut a, &mut b);
    }
    let (target, source) = (&groups[a], &groups[b]);
    let (first, other) = if target.owner < source.owner { (target, source) } else { (source, target) };
    let best_time = if source.timestamp_quality > target.timestamp_quality
        || (source.timestamp_quality == target.timestamp_quality
            && source.record.timestamp_ms < target.record.timestamp_ms)
    {
        source
    } else {
        target
    };
    let mut record = first.record.clone();
    if record.model == "antigravity-unknown" {
        record.model = other.record.model.clone();
    }
    record.timestamp_ms = best_time.record.timestamp_ms;
    for (field, (x, y)) in
        record.tokens.iter_mut().zip(target.record.tokens.iter().zip(&source.record.tokens))
    {
        *field = (*x).max(*y);
    }
    let (quality, owner, size) = (best_time.timestamp_quality, first.owner, source.size);
    let target = &mut groups[a];
    target.record = record;
    target.timestamp_quality = quality;
    target.owner = owner;
    target.size += size;
    groups[b].parent = a;
}

/// Merges candidates that share any identity, in order: a later alias can
/// bridge two groups formed earlier.
fn merge<'a>(candidates: impl Iterator<Item = &'a Candidate>) -> Vec<UsageRecord> {
    let mut groups: Vec<Group> = Vec::new();
    let mut identities: HashMap<u64, usize> = HashMap::new();
    for candidate in candidates {
        let index = groups.len();
        groups.push(Group {
            record: candidate.record.clone(),
            timestamp_quality: candidate.timestamp_quality,
            parent: index,
            size: 1,
            owner: index,
        });
        for key in &candidate.keys {
            if let Some(&existing) = identities.get(key) {
                union(&mut groups, index, existing);
            }
            identities.insert(*key, index);
        }
    }
    let mut roots: Vec<&Group> =
        groups.iter().enumerate().filter(|(i, g)| g.parent == *i).map(|(_, g)| g).collect();
    roots.sort_by_key(|group| group.owner);
    roots.into_iter().map(|group| group.record.clone()).collect()
}

/* -------------------------------------------------------------------------- */
/* Refresh                                                                    */
/* -------------------------------------------------------------------------- */

fn fingerprint(path: &Path) -> Option<String> {
    let part = |metadata: Option<std::fs::Metadata>| match metadata {
        Some(m) => format!("{}:{}.{}:{}.{}", m.size(), m.mtime(), m.mtime_nsec(), m.ctime(), m.ctime_nsec()),
        None => "-".into(),
    };
    let db = std::fs::metadata(path).ok()?;
    let mut wal = path.as_os_str().to_owned();
    wal.push("-wal");
    Some(format!("{}/{}", part(Some(db)), part(std::fs::metadata(wal).ok())))
}

/// `.db` files under `dir`, in name order. Directory symlinks are not followed.
fn database_paths(dir: &Path, out: &mut Vec<PathBuf>) -> bool {
    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(error) => return error.kind() == std::io::ErrorKind::NotFound,
    };
    let mut entries: Vec<_> = entries.flatten().collect();
    entries.sort_by_key(|entry| entry.file_name());
    let mut ok = true;
    for entry in entries {
        let Ok(kind) = entry.file_type() else { continue };
        let path = entry.path();
        if kind.is_dir() {
            ok &= database_paths(&path, out);
        } else if kind.is_file() && path.extension().and_then(|ext| ext.to_str()) == Some("db") {
            out.push(path);
        }
    }
    ok
}

/// Brings `cache` up to date with every conversation database. Returns
/// whether the cache changed, alongside the read outcome.
pub(super) fn refresh(
    cache: &mut AntigravityCache,
    dirs: &[PathBuf],
    retention_cutoff_ms: i64,
) -> (AntigravityRead, bool) {
    let mut ok = true;
    let mut changed = false;
    let mut paths = Vec::new();
    for dir in dirs {
        ok &= database_paths(dir, &mut paths);
    }

    let mut order = Vec::new();
    let mut visited = HashSet::new();
    for path in &paths {
        let canonical = std::fs::canonicalize(path).unwrap_or_else(|_| path.clone());
        let key = canonical.to_string_lossy().into_owned();
        if !visited.insert(key.clone()) {
            continue;
        }
        order.push(key.clone());
        let Some(print) = fingerprint(&canonical) else { continue };
        if cache.databases.get(&key).is_some_and(|entry| entry.fingerprint == print) {
            continue;
        }
        let mtime_ms =
            std::fs::metadata(&canonical).map(|m| m.mtime() * 1000 + m.mtime_nsec() / 1_000_000).unwrap_or(0);
        match read_database(&canonical, mtime_ms) {
            Some(candidates) => {
                cache.databases.insert(key, DatabaseEntry { fingerprint: print, candidates });
                changed = true;
            }
            // A failed read keeps serving the previous parse.
            None => ok = false,
        }
    }

    // Deleted conversations still count until they age out.
    let before = cache.databases.len();
    cache.databases.retain(|path, entry| {
        visited.contains(path)
            || entry.candidates.iter().any(|candidate| candidate.record.timestamp_ms >= retention_cutoff_ms)
    });
    let mut gone: Vec<String> =
        cache.databases.keys().filter(|path| !visited.contains(*path)).cloned().collect();
    gone.sort();
    order.extend(gone);
    order.retain(|path| cache.databases.contains_key(path));
    changed |= cache.databases.len() != before || order != cache.order;

    if changed {
        cache.order = order;
        let databases = &cache.databases;
        cache.records = merge(cache.order.iter().flat_map(|path| &databases[path].candidates));
    }

    let has_history = !cache.records.is_empty();
    let read = if !ok {
        AntigravityRead::Failed
    } else if !has_history && !dirs.iter().any(|dir| dir.is_dir()) {
        AntigravityRead::Missing
    } else {
        AntigravityRead::Ok
    };
    (read, changed)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn varint(mut value: u64, out: &mut Vec<u8>) {
        while value >= 0x80 {
            out.push((value as u8) | 0x80);
            value >>= 7;
        }
        out.push(value as u8);
    }

    fn number(field: u64, value: u64) -> Vec<u8> {
        let mut out = Vec::new();
        varint(field << 3, &mut out);
        varint(value, &mut out);
        out
    }

    fn bytes(field: u64, body: &[u8]) -> Vec<u8> {
        let mut out = Vec::new();
        varint((field << 3) | 2, &mut out);
        varint(body.len() as u64, &mut out);
        out.extend_from_slice(body);
        out
    }

    fn text(field: u64, value: &str) -> Vec<u8> {
        bytes(field, value.as_bytes())
    }

    fn hex(blob: &[u8]) -> String {
        blob.iter().map(|byte| format!("{byte:02X}")).collect()
    }

    fn records(stdout: &str) -> Vec<UsageRecord> {
        merge(parse_rows(stdout, "session-1", 0).unwrap().iter())
    }

    #[test]
    fn merges_generation_and_step_usage_and_keeps_retries_apart() {
        let stamp = number(1, 1_780_000_000);
        let usage = [
            number(2, 100),
            number(3, 40),
            number(4, 5),
            number(5, 20),
            number(9, 10),
            text(11, "response-1"),
        ]
        .concat();
        let retry = [number(1, 1026), number(2, 12), number(3, 3), text(11, "retry-1")].concat();
        let generation =
            bytes(1, &[bytes(4, &usage), text(19, "Gemini 3 Pro"), bytes(9, &bytes(4, &stamp))].concat());
        let step = [bytes(9, &usage), bytes(8, &stamp), bytes(28, &bytes(2, &retry))].concat();
        let stdout = format!("gen\t0\t{}\nstep\t0\t{}\n", hex(&generation), hex(&step));

        let records = records(&stdout);
        assert_eq!(records.len(), 2);
        let main = records.iter().find(|r| r.model == "gemini-3-pro").unwrap();
        assert_eq!(main.provider, Provider::Antigravity);
        assert_eq!(main.timestamp_ms, 1_780_000_000_000);
        assert_eq!(main.session_id, "session-1");
        assert_eq!(main.tokens, [100, 20, 5, 40, 10]);
        let retried = records.iter().find(|r| r.model == "claude-opus-4-6").unwrap();
        assert_eq!(retried.tokens[0], 12);
    }

    #[test]
    fn model_less_steps_take_their_generation_model() {
        let stdout: String = ["Gemini 3 Pro", "Claude Opus 4.6"]
            .iter()
            .enumerate()
            .map(|(idx, name)| {
                format!(
                    "gen\t{idx}\t{}\nstep\t{idx}\t{}\n",
                    hex(&bytes(1, &text(19, name))),
                    hex(&bytes(9, &number(2, 10 + idx as u64)))
                )
            })
            .collect();
        let models: Vec<String> = records(&stdout).into_iter().map(|r| r.model).collect();
        assert_eq!(models, ["gemini-3-pro", "claude-opus-4-6"]);
    }

    #[test]
    fn a_later_alias_bridges_separate_records() {
        let step_a = bytes(9, &[number(2, 100), text(11, "response")].concat());
        let step_b = bytes(9, &[number(3, 40), text(12, "provider")].concat());
        let generation = bytes(
            1,
            &[
                text(19, "Gemini 3 Pro"),
                bytes(
                    4,
                    &[number(2, 50), number(5, 20), text(11, "response"), text(12, "provider")].concat(),
                ),
            ]
            .concat(),
        );
        let stdout =
            format!("step\t0\t{}\nstep\t1\t{}\ngen\t0\t{}\n", hex(&step_a), hex(&step_b), hex(&generation));
        let records = records(&stdout);
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].tokens, [100, 20, 0, 40, 0]);
    }

    #[test]
    fn falls_back_to_trajectory_then_file_time() {
        let step = hex(&bytes(9, &[number(2, 10), text(11, "r")].concat()));
        let trajectory = hex(&bytes(2, &number(1, 1_780_000_200)));
        let with_trajectory = format!("trajectory\t{trajectory}\nstep\t0\t{step}\n");
        let candidates = parse_rows(&with_trajectory, "s", 5).unwrap();
        assert_eq!(
            (candidates[0].record.timestamp_ms, candidates[0].timestamp_quality),
            (1_780_000_200_000, 1)
        );
        let candidates = parse_rows(&format!("step\t0\t{step}\n"), "s", 5).unwrap();
        assert_eq!((candidates[0].record.timestamp_ms, candidates[0].timestamp_quality), (5, 0));
    }

    #[test]
    fn reads_numeric_model_ids_and_ignores_huge_unused_varints() {
        let mut huge = number(99, 0);
        huge.pop();
        huge.extend([0xff; 9]);
        huge.push(0x01);
        let step = bytes(9, &[number(1, 246), number(2, 10), number(3, 5), huge].concat());
        let records = records(&format!("step\t0\t{}\n", hex(&step)));
        assert_eq!(records[0].model, "gemini-2.5-pro");
        assert_eq!(records[0].tokens[0], 10);
        assert_eq!(records[0].tokens[3], 5);
    }

    #[test]
    fn rejects_malformed_metadata() {
        assert!(parse_rows("gen\t0\t0A05FF\n", "s", 0).is_err());
        assert!(parse_rows("step\t0\tzz\n", "s", 0).is_err());
    }

    #[test]
    fn reads_step_only_databases_through_sqlite() {
        let dir = std::env::temp_dir().join(format!("usage-history-antigravity-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let db = dir.join("conversation-1.db");
        std::fs::remove_file(&db).ok();
        let step = [
            bytes(9, &[number(1, 246), number(2, 10), number(3, 5)].concat()),
            bytes(8, &number(1, 1_780_000_000)),
        ]
        .concat();
        let sql = format!(
            "CREATE TABLE steps (idx INTEGER, metadata BLOB); INSERT INTO steps VALUES (0, X'{}'), (1, NULL);",
            hex(&step)
        );
        assert!(std::process::Command::new("sqlite3").arg(&db).arg(sql).status().unwrap().success());
        std::fs::write(dir.join("broken.db"), b"not a sqlite database").unwrap();

        let candidates = read_database(&db, 0).unwrap();
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].record.session_id, "conversation-1");
        assert_eq!(candidates[0].record.timestamp_ms, 1_780_000_000_000);
        assert!(read_database(&dir.join("broken.db"), 0).is_none());

        let mut cache = AntigravityCache::default();
        let (read, changed) = refresh(&mut cache, std::slice::from_ref(&dir), 0);
        assert!(matches!(read, AntigravityRead::Failed));
        assert!(changed);
        assert_eq!(cache.records.len(), 1);
        let (_, changed) = refresh(&mut cache, std::slice::from_ref(&dir), 0);
        assert!(!changed);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn normalizes_display_names() {
        assert_eq!(model_name("Gemini 3 Pro (High)", 0), "gemini-3-pro");
        assert_eq!(model_name("Claude 4.5 Sonnet (Thinking)", 0), "claude-sonnet-4-5");
        assert_eq!(model_name("Claude Opus 4.6", 0), "claude-opus-4-6");
        assert_eq!(model_name("", 9999), "antigravity-model-9999");
        assert_eq!(model_name("", 0), "");
    }
}
