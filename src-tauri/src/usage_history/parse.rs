//! Pure line parsers for the provider CLIs' on-disk session transcripts.
//!
//! Ported from t3code's `usageTranscripts.ts`. Each parser consumes one line
//! at a time so callers can stream large files; none of them touch the
//! filesystem.

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Provider {
    Claude,
    Codex,
    Devin,
}

/// Token counts in a fixed order: uncached input, cached input, cache
/// creation, output, reasoning. Cached and cache-creation input are disjoint
/// from uncached input; reasoning is a *subset* of output and must never be
/// added on top.
pub(crate) type Tokens = [u64; 5];

pub(crate) const UNCACHED_INPUT: usize = 0;
pub(crate) const CACHED_INPUT: usize = 1;
pub(crate) const CACHE_CREATION: usize = 2;
pub(crate) const OUTPUT: usize = 3;
pub(crate) const REASONING: usize = 4;

pub(crate) fn total_tokens(tokens: &Tokens) -> u64 {
    tokens[UNCACHED_INPUT] + tokens[CACHED_INPUT] + tokens[CACHE_CREATION] + tokens[OUTPUT]
}

/// Short keys: the persisted scan cache holds one of these per assistant
/// response across ~90 days of transcripts.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub(crate) struct UsageRecord {
    #[serde(rename = "p")]
    pub provider: Provider,
    #[serde(rename = "t")]
    pub timestamp_ms: i64,
    #[serde(rename = "m")]
    pub model: String,
    #[serde(rename = "s")]
    pub session_id: String,
    #[serde(rename = "u")]
    pub tokens: Tokens,
    #[serde(rename = "c", default, skip_serializing_if = "Option::is_none")]
    pub reported_cost_usd: Option<f64>,
    /// Fast mode bills at a model-specific multiple. Only Claude Code records it.
    #[serde(rename = "f", default, skip_serializing_if = "std::ops::Not::not")]
    pub fast: bool,
    /// Cross-file de-duplication key, or `None` when the record is inherently
    /// unique.
    #[serde(rename = "k", default, skip_serializing_if = "Option::is_none")]
    pub dedupe_key: Option<u64>,
}

/// FNV-1a, 64-bit. Stable across runs, which the persisted cache relies on.
pub(crate) fn fnv1a64(parts: &[&[u8]]) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for (index, part) in parts.iter().enumerate() {
        if index > 0 {
            hash ^= 0xff;
            hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
        }
        for byte in *part {
            hash ^= u64::from(*byte);
            hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
        }
    }
    hash
}

fn int(value: Option<f64>) -> u64 {
    match value {
        Some(v) if v.is_finite() && v > 0.0 => v.trunc() as u64,
        _ => 0,
    }
}

fn int_value(value: Option<&Value>) -> u64 {
    int(value.and_then(Value::as_f64))
}

/// Days since 1970-01-01 for a proleptic Gregorian date (Hinnant's algorithm).
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (month + 9) % 12;
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// Parses the RFC 3339 timestamps both CLIs write (`2026-09-28T10:11:12.345Z`).
pub(crate) fn parse_timestamp_ms(text: &str) -> Option<i64> {
    let b = text.as_bytes();
    if b.len() < 19 {
        return None;
    }
    let digits = |range: std::ops::Range<usize>| -> Option<i64> {
        let mut value = 0i64;
        for &byte in &b[range] {
            if !byte.is_ascii_digit() {
                return None;
            }
            value = value * 10 + i64::from(byte - b'0');
        }
        Some(value)
    };
    if b[4] != b'-' || b[7] != b'-' || !(b[10] == b'T' || b[10] == b't' || b[10] == b' ') {
        return None;
    }
    if b[13] != b':' || b[16] != b':' {
        return None;
    }
    let year = digits(0..4)?;
    let month = digits(5..7)?;
    let day = digits(8..10)?;
    let hour = digits(11..13)?;
    let minute = digits(14..16)?;
    let second = digits(17..19)?;
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) || hour > 23 || minute > 59 || second > 60
    {
        return None;
    }

    let mut index = 19;
    let mut millis = 0i64;
    if b.get(index) == Some(&b'.') {
        index += 1;
        let start = index;
        while index < b.len() && b[index].is_ascii_digit() {
            index += 1;
        }
        if index == start {
            return None;
        }
        let mut scale = 100;
        for &byte in &b[start..index.min(start + 3)] {
            millis += i64::from(byte - b'0') * scale;
            scale /= 10;
        }
    }

    let offset_seconds = match b.get(index) {
        None | Some(b'Z') | Some(b'z') => 0,
        Some(&sign @ (b'+' | b'-')) => {
            let rest = &text[index + 1..];
            let (h, m) = match rest.len() {
                5 if rest.as_bytes()[2] == b':' => (&rest[0..2], &rest[3..5]),
                4 => (&rest[0..2], &rest[2..4]),
                2 => (&rest[0..2], "00"),
                _ => return None,
            };
            let h: i64 = h.parse().ok()?;
            let m: i64 = m.parse().ok()?;
            let seconds = h * 3600 + m * 60;
            if sign == b'+' {
                seconds
            } else {
                -seconds
            }
        }
        _ => return None,
    };

    let days = days_from_civil(year, month, day);
    let seconds = days * 86_400 + hour * 3600 + minute * 60 + second - offset_seconds;
    Some(seconds * 1000 + millis)
}

/// Cheap substring gate applied before JSON parsing. Transcripts are mostly
/// tool output; only a minority of lines carry usage.
pub(crate) fn might_carry_usage(line: &[u8], provider: Provider) -> bool {
    match provider {
        Provider::Claude => memchr::memmem::find(line, br#""usage""#).is_some(),
        Provider::Codex => {
            memchr::memmem::find(line, br#""token_count""#).is_some()
                || memchr::memmem::find(line, br#""turn_context""#).is_some()
                || memchr::memmem::find(line, br#""session_meta""#).is_some()
        }
        Provider::Devin => false,
    }
}

/* -------------------------------------------------------------------------- */
/* Claude Code                                                                */
/* -------------------------------------------------------------------------- */

#[derive(Deserialize)]
struct ClaudeLine {
    #[serde(rename = "type")]
    kind: Option<String>,
    timestamp: Option<String>,
    #[serde(rename = "requestId")]
    request_id: Option<String>,
    #[serde(rename = "sessionId")]
    session_id: Option<String>,
    #[serde(rename = "costUSD")]
    cost_usd: Option<f64>,
    message: Option<ClaudeMessage>,
}

#[derive(Deserialize)]
struct ClaudeMessage {
    id: Option<String>,
    model: Option<String>,
    usage: Option<ClaudeUsage>,
}

#[derive(Deserialize)]
struct ClaudeUsage {
    input_tokens: Option<f64>,
    cache_read_input_tokens: Option<f64>,
    cache_creation_input_tokens: Option<f64>,
    output_tokens: Option<f64>,
    speed: Option<Value>,
}

/// Parses one line of a Claude Code transcript.
///
/// Claude Code writes one record per assistant *content block*, and every one
/// of those repeats the parent message's complete `usage` object. Summing
/// them overcounts, so the caller must drop repeats by `dedupe_key`.
pub(crate) fn parse_claude_line(line: &str) -> Option<UsageRecord> {
    let parsed: ClaudeLine = serde_json::from_str(line).ok()?;
    if parsed.kind.as_deref() != Some("assistant") {
        return None;
    }
    let message = parsed.message?;
    let usage = message.usage?;
    let timestamp_ms = parse_timestamp_ms(parsed.timestamp.as_deref()?)?;
    let model = message.model.filter(|m| !m.is_empty())?;

    // Matches ccusage: prefer the message/request pair, fall back to whichever
    // half exists. Records with neither cannot be de-duplicated.
    let dedupe_key = match (&message.id, &parsed.request_id) {
        (None, None) => None,
        (id, request) => Some(fnv1a64(&[
            b"claude",
            id.as_deref().unwrap_or("").as_bytes(),
            request.as_deref().unwrap_or("").as_bytes(),
        ])),
    };

    Some(UsageRecord {
        provider: Provider::Claude,
        timestamp_ms,
        model,
        session_id: parsed.session_id.unwrap_or_default(),
        tokens: [
            int(usage.input_tokens),
            int(usage.cache_read_input_tokens),
            int(usage.cache_creation_input_tokens),
            int(usage.output_tokens),
            // Anthropic folds thinking into output and does not break it out.
            0,
        ],
        reported_cost_usd: parsed.cost_usd.filter(|c| c.is_finite()),
        fast: usage.speed.as_ref().and_then(Value::as_str) == Some("fast"),
        dedupe_key,
    })
}

/* -------------------------------------------------------------------------- */
/* Codex                                                                      */
/* -------------------------------------------------------------------------- */

/// Rolling state for a single Codex rollout file.
///
/// Codex `token_count` events carry no model, so it is carried forward from
/// the most recent `turn_context`.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub(crate) struct CodexScanState {
    pub model: String,
    pub session_id: String,
    pub last_usage_signature: Option<String>,
    pub saw_session_meta: bool,
    /// While true, leading usage events are re-stamped copies of parent history.
    pub suppressing_fork_copies: bool,
    pub fork_copy_anchor_ms: i64,
}

/// A forked or subagent rollout opens with the parent's history copied in,
/// every line re-stamped to the fork instant in one burst (gaps of 0-40ms),
/// while the child's first genuine usage lands after a real turn (5s+).
const FORK_COPY_MAX_GAP_MS: i64 = 1000;

fn is_forked_session_meta(payload: &Value) -> bool {
    if payload.get("forked_from_id").and_then(Value::as_str).is_some() {
        return true;
    }
    payload
        .pointer("/source/subagent/thread_spawn/parent_thread_id")
        .and_then(Value::as_str)
        .is_some()
}

/// Feeds one line of a Codex rollout into `state`, returning a record when
/// the line was a usage event.
///
/// Deltas come from `last_token_usage`; consecutive identical events are
/// dropped so the sum reconciles with the session's `total_token_usage`.
pub(crate) fn parse_codex_line(line: &str, state: &mut CodexScanState) -> Option<UsageRecord> {
    let record: Value = serde_json::from_str(line).ok()?;
    let payload = record.get("payload").filter(|p| p.is_object())?;
    let kind = record.get("type").and_then(Value::as_str);

    if kind == Some("session_meta") {
        // Only the first meta describes this file's own session. A forked
        // rollout repeats the ancestors' metas right after it.
        if state.saw_session_meta {
            return None;
        }
        state.saw_session_meta = true;
        if let Some(id) = payload
            .get("id")
            .or_else(|| payload.get("session_id"))
            .and_then(Value::as_str)
        {
            state.session_id = id.to_string();
        }
        let meta_ms = record.get("timestamp").and_then(Value::as_str).and_then(parse_timestamp_ms);
        if let Some(meta_ms) = meta_ms {
            if is_forked_session_meta(payload) {
                state.suppressing_fork_copies = true;
                state.fork_copy_anchor_ms = meta_ms;
            }
        }
        return None;
    }

    if kind == Some("turn_context") {
        if let Some(model) = payload.get("model").and_then(Value::as_str) {
            state.model = model.to_string();
        }
        return None;
    }

    if payload.get("type").and_then(Value::as_str) != Some("token_count") {
        return None;
    }
    let last = payload
        .pointer("/info/last_token_usage")
        .filter(|v| v.is_object())?;

    // Only an otherwise-eligible event may consume the duplicate signature: a
    // token_count before its turn_context must not poison it.
    let timestamp_ms = record.get("timestamp").and_then(Value::as_str).and_then(parse_timestamp_ms)?;
    if state.model.is_empty() {
        return None;
    }

    let signature = last.to_string();
    if state.last_usage_signature.as_deref() == Some(signature.as_str()) {
        return None;
    }
    state.last_usage_signature = Some(signature);

    // The copied parent history was already counted from the parent's file.
    if state.suppressing_fork_copies {
        if timestamp_ms - state.fork_copy_anchor_ms < FORK_COPY_MAX_GAP_MS {
            state.fork_copy_anchor_ms = timestamp_ms;
            return None;
        }
        state.suppressing_fork_copies = false;
    }

    let input = int_value(last.get("input_tokens"));
    let cached = int_value(last.get("cached_input_tokens"));
    let creation = int_value(last.get("cache_write_input_tokens"));
    let output = int_value(last.get("output_tokens"));
    let tokens: Tokens = [
        // Codex reports `input_tokens` inclusive of the cached portion.
        input.saturating_sub(cached + creation),
        cached,
        creation,
        output,
        output.min(int_value(last.get("reasoning_output_tokens"))),
    ];
    if total_tokens(&tokens) == 0 {
        return None;
    }

    Some(UsageRecord {
        provider: Provider::Codex,
        timestamp_ms,
        model: state.model.clone(),
        session_id: state.session_id.clone(),
        tokens,
        reported_cost_usd: None,
        fast: false,
        // Assigned at scan time from the record's content plus its occurrence
        // within the file, so moved rollout copies de-duplicate.
        dedupe_key: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_rfc3339_timestamps() {
        assert_eq!(parse_timestamp_ms("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(parse_timestamp_ms("1970-01-01T00:00:01.5Z"), Some(1500));
        assert_eq!(parse_timestamp_ms("2026-09-28T10:11:12.345Z"), Some(1_790_590_272_345));
        assert_eq!(
            parse_timestamp_ms("2026-09-28T11:11:12.345+01:00"),
            parse_timestamp_ms("2026-09-28T10:11:12.345Z")
        );
        assert_eq!(parse_timestamp_ms("2024-02-29T00:00:00.123456789Z"), Some(1_709_164_800_123));
        assert_eq!(parse_timestamp_ms("not a date"), None);
        assert_eq!(parse_timestamp_ms("2026-13-01T00:00:00Z"), None);
    }

    #[test]
    fn claude_line_yields_record_with_dedupe_key() {
        let line = r#"{"type":"assistant","timestamp":"2026-09-01T12:00:00.000Z","sessionId":"s1","requestId":"req_1","message":{"id":"msg_1","model":"claude-opus-4-5","content":[{"type":"text","text":"hi"}],"usage":{"input_tokens":10,"cache_read_input_tokens":200,"cache_creation_input_tokens":30,"output_tokens":40,"speed":"fast"}}}"#;
        let record = parse_claude_line(line).expect("record");
        assert_eq!(record.model, "claude-opus-4-5");
        assert_eq!(record.session_id, "s1");
        assert_eq!(record.tokens, [10, 200, 30, 40, 0]);
        assert!(record.fast);
        assert!(record.dedupe_key.is_some());
        let again = parse_claude_line(line).unwrap();
        assert_eq!(record.dedupe_key, again.dedupe_key);
    }

    #[test]
    fn claude_skips_non_assistant_and_modelless_lines() {
        assert!(parse_claude_line(r#"{"type":"user","message":{"content":"usage"}}"#).is_none());
        assert!(parse_claude_line(
            r#"{"type":"assistant","timestamp":"2026-09-01T12:00:00Z","message":{"usage":{"input_tokens":1}}}"#
        )
        .is_none());
        assert!(parse_claude_line("not json").is_none());
    }

    fn codex_lines(lines: &[&str]) -> Vec<UsageRecord> {
        let mut state = CodexScanState::default();
        lines.iter().filter_map(|line| parse_codex_line(line, &mut state)).collect()
    }

    const META: &str = r#"{"timestamp":"2026-09-01T12:00:00.000Z","type":"session_meta","payload":{"id":"sess-1"}}"#;
    const TURN: &str = r#"{"timestamp":"2026-09-01T12:00:01.000Z","type":"turn_context","payload":{"model":"gpt-5-codex"}}"#;

    fn token_count(ts: &str, input: u64, cached: u64, output: u64) -> String {
        format!(
            r#"{{"timestamp":"{ts}","type":"event_msg","payload":{{"type":"token_count","info":{{"last_token_usage":{{"input_tokens":{input},"cached_input_tokens":{cached},"output_tokens":{output},"reasoning_output_tokens":5}}}}}}}}"#
        )
    }

    #[test]
    fn codex_carries_model_and_splits_cached_input() {
        let usage = token_count("2026-09-01T12:00:10.000Z", 100, 60, 20);
        let records = codex_lines(&[META, TURN, &usage]);
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].model, "gpt-5-codex");
        assert_eq!(records[0].session_id, "sess-1");
        assert_eq!(records[0].tokens, [40, 60, 0, 20, 5]);
    }

    #[test]
    fn codex_drops_consecutive_duplicates_and_modelless_events() {
        let first = token_count("2026-09-01T12:00:00.500Z", 100, 0, 20);
        let second = token_count("2026-09-01T12:00:10.000Z", 100, 0, 20);
        let third = token_count("2026-09-01T12:00:20.000Z", 50, 0, 10);
        // `first` arrives before any turn_context and must not poison the signature.
        let records = codex_lines(&[META, &first, TURN, &second, &second, &third]);
        assert_eq!(records.len(), 2);
    }

    #[test]
    fn codex_suppresses_fork_copy_burst() {
        let meta = r#"{"timestamp":"2026-09-01T12:00:00.000Z","type":"session_meta","payload":{"id":"child","forked_from_id":"parent"}}"#;
        let copy_a = token_count("2026-09-01T12:00:00.010Z", 100, 0, 1);
        let copy_b = token_count("2026-09-01T12:00:00.030Z", 200, 0, 2);
        let real = token_count("2026-09-01T12:00:08.000Z", 300, 0, 3);
        let records = codex_lines(&[meta, TURN, &copy_a, &copy_b, &real]);
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].tokens[OUTPUT], 3);
    }
}
