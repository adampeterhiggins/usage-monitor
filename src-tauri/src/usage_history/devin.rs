//! Devin CLI usage, read from its `sessions.db` (ported from the
//! adampeterhiggins/t3code fork's `devinUsageReader`).
//!
//! Each assistant message records its own request metrics, and
//! `input_tokens` already excludes cache reads. Forked sessions copy nodes,
//! so one message appears in many rows; its `message_id` identifies it once.
//! Only the usage fields are extracted in SQL, so large tool outputs never
//! leave SQLite.
//!
//! The database runs to gigabytes and has no index on `created_at`, so reads
//! are incremental: `row_id` is AUTOINCREMENT, and each scan asks only for
//! rows past the cached high-water mark.

use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};

use super::parse::{fnv1a64, parse_timestamp_ms, total_tokens, Provider, UsageRecord};

#[derive(Clone, Default, Serialize, Deserialize)]
pub(super) struct DevinCache {
    db_path: String,
    /// Largest `row_id` already read; later rows are new.
    high_water: i64,
    pub records: Vec<UsageRecord>,
}

pub(super) enum DevinRead {
    /// No Devin CLI history on this Mac.
    Missing,
    /// `sqlite3` failed; any previously cached records still stand.
    Failed,
    Ok,
}

fn home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

/// `$XDG_DATA_HOME/devin/cli`, defaulting to `~/.local/share/devin/cli`.
pub(super) fn devin_cli_dir() -> Option<PathBuf> {
    let data_home = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
        .or_else(|| home().map(|h| h.join(".local/share")))?;
    let dir = data_home.join("devin/cli");
    Some(std::fs::canonicalize(&dir).unwrap_or(dir))
}

fn sqlite3_bin() -> &'static str {
    if Path::new("/usr/bin/sqlite3").exists() {
        "/usr/bin/sqlite3"
    } else {
        "sqlite3"
    }
}

/// One tab-separated row per assistant message, preceded by a `max` line with
/// the table's largest `row_id`. Fields are ids, numbers, and model slugs —
/// none of which contain tabs or newlines.
fn query(since_row: i64, since_seconds: i64) -> String {
    format!(
        "SELECT 'max', coalesce(max(row_id), 0) FROM message_nodes;
SELECT 'row', row_id, session_id, created_at,
  json_extract(chat_message, '$.message_id'),
  json_extract(chat_message, '$.metadata.created_at'),
  json_extract(chat_message, '$.metadata.generation_model'),
  json_extract(chat_message, '$.metadata.metrics.input_tokens'),
  json_extract(chat_message, '$.metadata.metrics.output_tokens'),
  json_extract(chat_message, '$.metadata.metrics.cache_read_tokens'),
  json_extract(chat_message, '$.metadata.metrics.cache_creation_tokens')
FROM message_nodes
WHERE row_id > {since_row} AND created_at >= {since_seconds}
  AND json_extract(chat_message, '$.role') = 'assistant'
ORDER BY row_id;"
    )
}

fn tokens(field: Option<&str>) -> u64 {
    field
        .and_then(|value| value.parse::<f64>().ok())
        .filter(|value| value.is_finite() && *value > 0.0)
        .map_or(0, |value| value.trunc() as u64)
}

/// Parses one `row` line into a record. Rows without a message id cannot be
/// de-duplicated across forks and are dropped, as in the fork.
fn parse_row(fields: &[&str]) -> Option<UsageRecord> {
    let [_, _row_id, session, created_at, id, message_at, model, input, output, cache_read, cache_creation] =
        fields
    else {
        return None;
    };
    if id.is_empty() {
        return None;
    }
    let timestamp_ms = parse_timestamp_ms(message_at)
        .or_else(|| created_at.parse::<i64>().ok().map(|seconds| seconds * 1000))?;
    let tokens = [
        tokens(Some(input)),
        tokens(Some(cache_read)),
        tokens(Some(cache_creation)),
        tokens(Some(output)),
        0,
    ];
    if total_tokens(&tokens) == 0 {
        return None;
    }
    Some(UsageRecord {
        provider: Provider::Devin,
        timestamp_ms,
        model: if model.is_empty() { "devin".into() } else { (*model).to_string() },
        session_id: (*session).to_string(),
        tokens,
        reported_cost_usd: None,
        fast: false,
        dedupe_key: Some(fnv1a64(&[b"devin", id.as_bytes()])),
    })
}

/// Folds `sqlite3` output into the cache, returning whether it parsed. Fork
/// copies of an already-cached message are dropped on the way in.
fn apply_output(cache: &mut DevinCache, stdout: &str) -> bool {
    let mut seen: std::collections::HashSet<u64> =
        cache.records.iter().filter_map(|record| record.dedupe_key).collect();
    let mut max_row = None;
    for line in stdout.lines() {
        let fields: Vec<&str> = line.split('\t').collect();
        match fields.first() {
            Some(&"max") => max_row = fields.get(1).and_then(|v| v.parse::<i64>().ok()),
            Some(&"row") => {
                if let Some(record) = parse_row(&fields) {
                    if record.dedupe_key.is_none_or(|key| seen.insert(key)) {
                        cache.records.push(record);
                    }
                }
            }
            _ => {}
        }
    }
    let Some(max_row) = max_row else { return false };
    cache.high_water = cache.high_water.max(max_row);
    true
}

/// Brings `cache` up to date with the live database. Returns whether the
/// cache changed, alongside the read outcome.
pub(super) fn refresh(cache: &mut DevinCache, retention_cutoff_ms: i64) -> (DevinRead, bool) {
    let Some(dir) = devin_cli_dir() else { return (DevinRead::Missing, false) };
    let db = dir.join("sessions.db");
    if !db.is_file() {
        return (DevinRead::Missing, false);
    }
    let db_path = db.to_string_lossy().into_owned();
    if cache.db_path != db_path {
        *cache = DevinCache { db_path: db_path.clone(), ..DevinCache::default() };
    }

    let sql = query(cache.high_water, retention_cutoff_ms.div_euclid(1000));
    let output = Command::new(sqlite3_bin())
        .args(["-readonly", "-batch", "-noheader", "-separator", "\t", "-cmd", ".timeout 2000"])
        .arg(&db_path)
        .arg(&sql)
        .output();
    let Ok(output) = output else { return (DevinRead::Failed, false) };
    if !output.status.success() {
        return (DevinRead::Failed, false);
    }
    let stdout = String::from_utf8_lossy(&output.stdout);

    let before_high_water = cache.high_water;
    let before_len = cache.records.len();
    // A replaced database restarts its row ids below our mark.
    if let Some(max) = stdout
        .lines()
        .find_map(|line| line.strip_prefix("max\t").and_then(|v| v.parse::<i64>().ok()))
    {
        if max < cache.high_water {
            *cache = DevinCache { db_path, ..DevinCache::default() };
            return refresh(cache, retention_cutoff_ms);
        }
    }
    if !apply_output(cache, &stdout) {
        return (DevinRead::Failed, false);
    }

    cache.records.retain(|record| record.timestamp_ms >= retention_cutoff_ms);
    let changed = cache.high_water != before_high_water || cache.records.len() != before_len;
    (DevinRead::Ok, changed)
}

const CATALOG_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(20);

/// `devin models list --format json`, whose `cost_summary` strings are the
/// only published prices for Devin's own models (`swe-*`). A GUI app does
/// not inherit the shell's PATH, so the CLI is found at its install paths.
pub(crate) fn model_catalog() -> Result<String, String> {
    let home = home().ok_or_else(|| "Could not resolve the home directory.".to_string())?;
    let candidates = [
        devin_cli_dir().map(|dir| dir.join("_versions/current/bin/devin")),
        Some(home.join(".local/bin/devin")),
    ];
    let bin = candidates
        .into_iter()
        .flatten()
        .find(|path| path.is_file())
        .ok_or_else(|| "The Devin CLI is not installed.".to_string())?;

    let mut child = Command::new(bin)
        .args(["models", "list", "--format", "json"])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Could not run the Devin CLI: {e}"))?;
    let mut stdout = child.stdout.take().expect("piped stdout");
    let reader = std::thread::spawn(move || {
        let mut buffer = String::new();
        std::io::Read::read_to_string(&mut stdout, &mut buffer).map(|_| buffer)
    });
    let deadline = std::time::Instant::now() + CATALOG_TIMEOUT;
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            break status;
        }
        if std::time::Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err("The Devin CLI took too long to list models.".into());
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    };
    let body = reader
        .join()
        .map_err(|_| "Devin CLI output could not be read.".to_string())?
        .map_err(|e| format!("Devin CLI output could not be read: {e}"))?;
    if !status.success() {
        return Err("The Devin CLI could not list models.".into());
    }
    Ok(body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_rows_and_tracks_high_water() {
        let stdout = "max\t42\n\
row\t40\tsess-1\t1790000000\tmsg-1\t2026-09-01T12:00:00Z\tswe-1-7\t100\t20\t300\t0\n\
row\t41\tsess-1\t1790000001\tmsg-2\t\tswe-2-max\t0\t0\t0\t0\n\
row\t42\tsess-2\t1790000002\t\t\tswe-1-7\t5\t5\t5\t5\n";
        let mut cache = DevinCache::default();
        assert!(apply_output(&mut cache, stdout));
        assert_eq!(cache.high_water, 42);
        assert_eq!(cache.records.len(), 1);
        let record = &cache.records[0];
        assert_eq!(record.model, "swe-1-7");
        assert_eq!(record.tokens, [100, 300, 0, 20, 0]);
        assert_eq!(record.timestamp_ms, parse_timestamp_ms("2026-09-01T12:00:00Z").unwrap());
        assert!(record.dedupe_key.is_some());
    }

    #[test]
    fn falls_back_to_row_created_at_and_default_model() {
        let fields = ["row", "1", "s", "1790000000", "m", "", "", "1", "0", "0", "0"];
        let record = parse_row(&fields).unwrap();
        assert_eq!(record.timestamp_ms, 1_790_000_000_000);
        assert_eq!(record.model, "devin");
    }

    #[test]
    fn rejects_output_without_max_line() {
        assert!(!apply_output(&mut DevinCache::default(), "garbage"));
    }
}
