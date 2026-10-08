//! OpenCode usage, read from its SQLite store (`opencode.db`, plus
//! `opencode-<channel>.db` for other release channels) and the per-message
//! JSON files it kept before migrating to SQLite (ported from t3code's
//! `opencodeUsageReader`).
//!
//! Each assistant message carries its own token counts and, for models with a
//! known rate, OpenCode's own `cost`. Reasoning is counted apart from output,
//! unlike the other sources. Only the usage fields are extracted in SQL.
//!
//! A message row is written when a response starts and rewritten as it
//! completes, so reads are incremental on `time_updated` and upsert by
//! message id. Legacy JSON files are memoised by `(size, mtime)`.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::parse::{fnv1a64, total_tokens, Provider, UsageRecord};
use super::{sqlite, xdg_data_home};

/// The tables OpenCode has kept messages in: `message`, and `session_message`
/// in newer schemas.
const TABLES: [&str; 2] = ["message", "session_message"];

#[derive(Clone, Default, Serialize, Deserialize)]
struct DatabaseCache {
    /// Largest `time_updated` already read, per table; later writes are new.
    high_water: HashMap<String, i64>,
    records: Vec<UsageRecord>,
}

#[derive(Clone, Serialize, Deserialize)]
struct LegacyEntry {
    size: u64,
    mtime_ms: i64,
    record: Option<UsageRecord>,
}

#[derive(Clone, Default, Serialize, Deserialize)]
pub(super) struct OpenCodeCache {
    root: String,
    databases: HashMap<String, DatabaseCache>,
    legacy: HashMap<String, LegacyEntry>,
}

impl OpenCodeCache {
    /// Database records first, so a migrated message counts from SQLite
    /// rather than its old JSON copy; callers de-duplicate by `dedupe_key`.
    pub(super) fn records(&self) -> impl Iterator<Item = &UsageRecord> {
        let mut names: Vec<&String> = self.databases.keys().collect();
        names.sort_by_key(|name| (!name.ends_with("/opencode.db"), name.as_str()));
        names
            .into_iter()
            .flat_map(|name| &self.databases[name].records)
            .chain(self.legacy.values().filter_map(|entry| entry.record.as_ref()))
    }

    /// Databases and legacy files that hold any usage.
    pub(super) fn sources_with_history(&self) -> u64 {
        let databases = self.databases.values().filter(|db| !db.records.is_empty()).count();
        let legacy = self.legacy.values().filter(|entry| entry.record.is_some()).count();
        (databases + legacy) as u64
    }
}

pub(super) enum OpenCodeRead {
    /// No OpenCode history on this Mac.
    Missing,
    /// A database or message file could not be read; cached records stand.
    Failed,
    Ok,
}

/// `$XDG_DATA_HOME/opencode`, defaulting to `~/.local/share/opencode`.
pub(super) fn opencode_dir() -> Option<PathBuf> {
    let dir = xdg_data_home()?.join("opencode");
    Some(std::fs::canonicalize(&dir).unwrap_or(dir))
}

/// The usage fields of one message, from either store.
#[derive(Default)]
struct Message<'a> {
    id: &'a str,
    session_id: &'a str,
    role: &'a str,
    model: &'a str,
    created_ms: Option<i64>,
    input: u64,
    output: u64,
    reasoning: u64,
    cache_read: u64,
    cache_write: u64,
    cost: Option<f64>,
}

fn to_record(message: &Message) -> Option<UsageRecord> {
    if !message.role.is_empty() && message.role != "assistant" {
        return None;
    }
    if message.model.is_empty() {
        return None;
    }
    let tokens = [
        message.input,
        message.cache_read,
        message.cache_write,
        // Reasoning is reported beside output, not inside it.
        message.output + message.reasoning,
        message.reasoning,
    ];
    if total_tokens(&tokens) == 0 {
        return None;
    }
    Some(UsageRecord {
        provider: Provider::OpenCode,
        timestamp_ms: message.created_ms?,
        model: message.model.to_string(),
        session_id: message.session_id.to_string(),
        tokens,
        // OpenCode writes zero for models without a known rate, including paid
        // subscription models; those are priced from the rate table instead.
        reported_cost_usd: message.cost.filter(|cost| cost.is_finite() && *cost > 0.0),
        fast: false,
        dedupe_key: (!message.id.is_empty()).then(|| fnv1a64(&[b"opencode", message.id.as_bytes()])),
    })
}

fn tokens(field: &str) -> u64 {
    field
        .parse::<f64>()
        .ok()
        .filter(|value| value.is_finite() && *value > 0.0)
        .map_or(0, |value| value.trunc() as u64)
}

fn number(field: &str) -> Option<f64> {
    field.parse::<f64>().ok().filter(|value| value.is_finite())
}

/// Lists which message tables exist and the timestamp columns each has.
const SCHEMA_QUERY: &str = "SELECT m.name, p.name FROM sqlite_master m, pragma_table_info(m.name) p
WHERE m.type = 'table' AND m.name IN ('message', 'session_message');";

/// A `max` line per table with its largest `time_updated`, then one row per
/// assistant message. Fields are ids, numbers, and model slugs — none of
/// which contain tabs or newlines.
fn rows_query(tables: &[(&str, bool, bool)], high_water: &HashMap<String, i64>, since_ms: i64) -> String {
    let mut sql = String::new();
    for &(table, has_created, has_updated) in tables {
        let mut predicates = vec!["json_valid(data)".to_string()];
        if table == "session_message" {
            predicates.push("type = 'assistant'".into());
        }
        if has_updated {
            let mark = high_water.get(table).copied().unwrap_or(0);
            sql.push_str(&format!("SELECT 'max', '{table}', coalesce(max(time_updated), 0) FROM {table};\n"));
            // Inclusive, so a row rewritten in the same millisecond is seen.
            predicates.push(format!("time_updated >= {mark}"));
        }
        if has_created {
            predicates.push(format!("time_created >= {since_ms}"));
        }
        let created = if has_created { "time_created" } else { "NULL" };
        sql.push_str(&format!(
            "SELECT 'row', id, session_id, {created},
  json_extract(data, '$.role'),
  json_extract(data, '$.sessionID'),
  coalesce(json_extract(data, '$.model.id'), json_extract(data, '$.model.modelID'),
    json_extract(data, '$.modelID')),
  json_extract(data, '$.time.created'),
  json_extract(data, '$.tokens.input'),
  json_extract(data, '$.tokens.output'),
  json_extract(data, '$.tokens.reasoning'),
  json_extract(data, '$.tokens.cache.read'),
  json_extract(data, '$.tokens.cache.write'),
  json_extract(data, '$.cost')
FROM {table} WHERE {};\n",
            predicates.join(" AND ")
        ));
    }
    sql
}

/// Parses one `row` line into a record.
fn parse_row(fields: &[&str]) -> Option<UsageRecord> {
    let [_, id, session, created, role, json_session, model, json_created, input, output, reasoning, cache_read, cache_write, cost] = fields
    else {
        return None;
    };
    to_record(&Message {
        id,
        session_id: if session.is_empty() { json_session } else { session },
        role,
        model,
        created_ms: number(json_created).or_else(|| number(created)).map(|ms| ms.trunc() as i64),
        input: tokens(input),
        output: tokens(output),
        reasoning: tokens(reasoning),
        cache_read: tokens(cache_read),
        cache_write: tokens(cache_write),
        cost: number(cost),
    })
}

/// Folds `sqlite3` output into one database's cache. Returns whether any
/// table's high-water mark went backwards (the database was replaced).
fn apply_rows(cache: &mut DatabaseCache, stdout: &str) -> bool {
    let mut index: HashMap<u64, usize> =
        cache.records.iter().enumerate().filter_map(|(at, record)| Some((record.dedupe_key?, at))).collect();
    let mut replaced = false;
    for line in stdout.lines() {
        let fields: Vec<&str> = line.split('\t').collect();
        match fields.first() {
            Some(&"max") => {
                let (Some(table), Some(max)) =
                    (fields.get(1), fields.get(2).and_then(|v| v.parse::<i64>().ok()))
                else {
                    continue;
                };
                let mark = cache.high_water.entry((*table).to_string()).or_insert(0);
                replaced |= max < *mark;
                *mark = (*mark).max(max);
            }
            Some(&"row") => {
                let Some(record) = parse_row(&fields) else { continue };
                // A rewritten message replaces its earlier, partial form.
                match record.dedupe_key.and_then(|key| index.get(&key)) {
                    Some(&at) => cache.records[at] = record,
                    None => {
                        if let Some(key) = record.dedupe_key {
                            index.insert(key, cache.records.len());
                        }
                        cache.records.push(record);
                    }
                }
            }
            _ => {}
        }
    }
    replaced
}

/// Reads one database's new and rewritten messages into `cache`.
fn refresh_database(db: &Path, cache: &mut DatabaseCache, since_ms: i64) -> Option<()> {
    let schema = sqlite::query(db, SCHEMA_QUERY)?;
    let tables: Vec<(&str, bool, bool)> = TABLES
        .iter()
        .filter_map(|&table| {
            let columns: Vec<&str> =
                schema.lines().filter_map(|line| line.strip_prefix(table)?.strip_prefix('\t')).collect();
            (!columns.is_empty())
                .then(|| (table, columns.contains(&"time_created"), columns.contains(&"time_updated")))
        })
        .collect();
    if tables.is_empty() {
        return None;
    }
    let stdout = sqlite::query(db, &rows_query(&tables, &cache.high_water, since_ms))?;
    if apply_rows(cache, &stdout) {
        // Row timestamps restarted below the mark: re-read from scratch.
        *cache = DatabaseCache::default();
        let stdout = sqlite::query(db, &rows_query(&tables, &cache.high_water, since_ms))?;
        apply_rows(cache, &stdout);
    }
    Some(())
}

/// `opencode.db` and `opencode-<channel>.db` directly under `root`.
fn database_paths(root: &Path) -> Result<Vec<PathBuf>, std::io::Error> {
    let mut found = Vec::new();
    for entry in std::fs::read_dir(root)?.flatten() {
        let name = entry.file_name();
        let Some(name) = name.to_str() else { continue };
        let channel = name.strip_prefix("opencode").and_then(|rest| rest.strip_suffix(".db"));
        let valid = channel.is_some_and(|channel| {
            channel.is_empty()
                || channel.strip_prefix('-').is_some_and(|c| {
                    !c.is_empty() && c.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
                })
        });
        if valid && entry.file_type().is_ok_and(|kind| kind.is_file()) {
            found.push(entry.path());
        }
    }
    found.sort();
    Ok(found)
}

fn mtime_ms(metadata: &std::fs::Metadata) -> i64 {
    metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |duration| duration.as_millis() as i64)
}

/// Parses one legacy `storage/message/<session>/<message>.json` file; the
/// file name is the message id.
fn parse_legacy(bytes: &[u8], id: &str) -> Option<UsageRecord> {
    let message: Value = serde_json::from_slice(bytes).ok()?;
    let text = |pointer: &str| message.pointer(pointer).and_then(Value::as_str).unwrap_or("");
    let count = |pointer: &str| {
        message
            .pointer(pointer)
            .and_then(Value::as_f64)
            .filter(|value| value.is_finite() && *value > 0.0)
            .map_or(0, |value| value.trunc() as u64)
    };
    let model = [text("/model/id"), text("/model/modelID"), text("/modelID")]
        .into_iter()
        .find(|model| !model.is_empty())
        .unwrap_or("");
    to_record(&Message {
        id: if id.is_empty() { text("/id") } else { id },
        session_id: text("/sessionID"),
        role: text("/role"),
        model,
        created_ms: message
            .pointer("/time/created")
            .and_then(Value::as_f64)
            .filter(|ms| ms.is_finite())
            .map(|ms| ms.trunc() as i64),
        input: count("/tokens/input"),
        output: count("/tokens/output"),
        reasoning: count("/tokens/reasoning"),
        cache_read: count("/tokens/cache/read"),
        cache_write: count("/tokens/cache/write"),
        cost: message.get("cost").and_then(Value::as_f64),
    })
}

/// Walks the legacy message store, parsing new or changed files. Returns
/// whether every file could be read, and whether the cache changed.
/// Directory symlinks are not followed.
///
/// Records past retention are dropped but their entries kept, so an old file
/// is not re-parsed every scan.
fn refresh_legacy(root: &Path, cache: &mut OpenCodeCache, retention_cutoff_ms: i64) -> (bool, bool) {
    let mut ok = true;
    let mut changed = false;
    let mut live = HashSet::new();
    let mut pending = vec![root.join("storage/message")];
    while let Some(dir) = pending.pop() {
        let entries = match std::fs::read_dir(&dir) {
            Ok(entries) => entries,
            Err(error) => {
                ok &= error.kind() == std::io::ErrorKind::NotFound;
                continue;
            }
        };
        for entry in entries.flatten() {
            let Ok(kind) = entry.file_type() else { continue };
            let path = entry.path();
            if kind.is_dir() {
                pending.push(path);
                continue;
            }
            if !kind.is_file() || path.extension().and_then(|ext| ext.to_str()) != Some("json") {
                continue;
            }
            let Ok(metadata) = entry.metadata() else { continue };
            let key = path.to_string_lossy().into_owned();
            let (size, mtime) = (metadata.len(), mtime_ms(&metadata));
            live.insert(key.clone());
            if cache.legacy.get(&key).is_some_and(|e| e.size == size && e.mtime_ms == mtime) {
                continue;
            }
            match std::fs::read(&path) {
                Ok(bytes) => {
                    let id = path.file_stem().and_then(|stem| stem.to_str()).unwrap_or("");
                    let record = parse_legacy(&bytes, id);
                    cache.legacy.insert(key, LegacyEntry { size, mtime_ms: mtime, record });
                    changed = true;
                }
                Err(error) => ok &= error.kind() == std::io::ErrorKind::NotFound,
            }
        }
    }
    for entry in cache.legacy.values_mut() {
        if entry.record.as_ref().is_some_and(|record| record.timestamp_ms < retention_cutoff_ms) {
            entry.record = None;
            changed = true;
        }
    }
    // Files OpenCode has since removed still count until they age out.
    let before = cache.legacy.len();
    cache.legacy.retain(|path, entry| live.contains(path) || entry.record.is_some());
    (ok, changed || cache.legacy.len() != before)
}

/// Brings `cache` up to date with the live store. Returns whether the cache
/// changed, alongside the read outcome.
pub(super) fn refresh(cache: &mut OpenCodeCache, retention_cutoff_ms: i64) -> (OpenCodeRead, bool) {
    let Some(root) = opencode_dir() else { return (OpenCodeRead::Missing, false) };
    let root_key = root.to_string_lossy().into_owned();
    let mut changed = false;
    if cache.root != root_key {
        *cache = OpenCodeCache { root: root_key, ..OpenCodeCache::default() };
        changed = true;
    }

    let databases = match database_paths(&root) {
        Ok(paths) => paths,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return (OpenCodeRead::Missing, changed);
        }
        Err(_) => return (OpenCodeRead::Failed, changed),
    };
    let mut ok = true;
    for db in &databases {
        let entry = cache.databases.entry(db.to_string_lossy().into_owned()).or_default();
        // A message rewrite always advances `time_updated`.
        let before = entry.high_water.clone();
        if refresh_database(db, entry, retention_cutoff_ms).is_none() {
            ok = false;
            continue;
        }
        changed |= entry.high_water != before;
    }
    // A removed database's history still counts until it ages out.
    let before: usize = cache.databases.values().map(|db| db.records.len()).sum();
    for entry in cache.databases.values_mut() {
        entry.records.retain(|record| record.timestamp_ms >= retention_cutoff_ms);
    }
    cache.databases.retain(|path, entry| {
        !entry.records.is_empty() || databases.iter().any(|db| db.as_os_str() == path.as_str())
    });
    changed |= cache.databases.values().map(|db| db.records.len()).sum::<usize>() != before;

    let (legacy_ok, legacy_changed) = refresh_legacy(&root, cache, retention_cutoff_ms);
    ok &= legacy_ok;
    changed |= legacy_changed;

    let found = !databases.is_empty() || root.join("storage/message").is_dir();
    if !found && cache.sources_with_history() == 0 {
        return (OpenCodeRead::Missing, changed);
    }
    (if ok { OpenCodeRead::Ok } else { OpenCodeRead::Failed }, changed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::usage_history::parse::OUTPUT;

    /// Shaped after a real OpenCode assistant `message.data`.
    const MESSAGE: &str = r#"{"id":"msg_1","sessionID":"ses_1","role":"assistant","modelID":"claude-sonnet-4-5","providerID":"anthropic","time":{"created":1780000000000,"completed":1780000004000},"cost":0.25,"tokens":{"input":100,"output":20,"reasoning":5,"cache":{"read":30,"write":10}},"finish":"stop"}"#;

    #[test]
    fn legacy_message_counts_reasoning_beside_output() {
        let record = parse_legacy(MESSAGE.as_bytes(), "msg_1").unwrap();
        assert_eq!(record.provider, Provider::OpenCode);
        assert_eq!(record.model, "claude-sonnet-4-5");
        assert_eq!(record.session_id, "ses_1");
        assert_eq!(record.timestamp_ms, 1_780_000_000_000);
        assert_eq!(record.tokens, [100, 30, 10, 25, 5]);
        assert_eq!(record.reported_cost_usd, Some(0.25));
        assert_eq!(record.dedupe_key, Some(fnv1a64(&[b"opencode", b"msg_1"])));
    }

    #[test]
    fn zero_cost_is_left_to_the_rate_table() {
        let free = MESSAGE.replace(r#""cost":0.25"#, r#""cost":0"#);
        assert_eq!(parse_legacy(free.as_bytes(), "msg_1").unwrap().reported_cost_usd, None);
        let user = MESSAGE.replace(r#""role":"assistant""#, r#""role":"user""#);
        assert!(parse_legacy(user.as_bytes(), "msg_1").is_none());
    }

    #[test]
    fn rows_upsert_by_message_id_and_track_high_water() {
        let mut cache = DatabaseCache::default();
        let first = "max\tmessage\t1780000000500\n\
row\tmsg_1\tses_1\t1780000000000\tassistant\t\tgpt-5.4-nano\t\t\t\t\t\t\t0\n\
row\tmsg_2\tses_1\t1780000001000\tassistant\t\tgpt-5.4-nano\t1780000001000\t6009\t10\t11\t0\t0\t0.00122805\n";
        assert!(!apply_rows(&mut cache, first));
        assert_eq!(cache.high_water["message"], 1_780_000_000_500);
        // msg_1 has not completed yet, so it carries no tokens.
        assert_eq!(cache.records.len(), 1);
        assert_eq!(cache.records[0].tokens, [6009, 0, 0, 21, 11]);

        let second = "max\tmessage\t1780000009000\n\
row\tmsg_1\tses_1\t1780000000000\tassistant\t\tgpt-5.4-nano\t\t100\t5\t0\t0\t0\t0\n\
row\tmsg_2\tses_1\t1780000001000\tassistant\t\tgpt-5.4-nano\t1780000001000\t7000\t10\t11\t0\t0\t0.002\n";
        assert!(!apply_rows(&mut cache, second));
        assert_eq!(cache.records.len(), 2);
        assert_eq!(cache.records[0].tokens[0], 7000);
        assert_eq!(cache.records[1].timestamp_ms, 1_780_000_000_000);

        assert!(apply_rows(&mut cache, "max\tmessage\t5\n"));
    }

    #[test]
    fn reads_new_and_rewritten_rows_through_sqlite() {
        let dir = std::env::temp_dir().join(format!("usage-history-opencode-db-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let db = dir.join("opencode.db");
        std::fs::remove_file(&db).ok();
        let write = |sql: &str| {
            let status = std::process::Command::new("sqlite3").arg(&db).arg(sql).status().unwrap();
            assert!(status.success());
        };
        let quoted = MESSAGE.replace('\'', "''");
        write(&format!(
            "CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, time_created INTEGER NOT NULL,
               time_updated INTEGER NOT NULL, data TEXT NOT NULL);
             INSERT INTO message VALUES ('msg_1', 'ses_1', 1780000000000, 1780000004000, '{quoted}');
             INSERT INTO message VALUES ('msg_0', 'ses_1', 1700000000000, 1700000000000, '{quoted}');
             INSERT INTO message VALUES ('bad', 'ses_1', 1780000000000, 1780000000000, 'not json');"
        ));

        let mut cache = DatabaseCache::default();
        assert!(refresh_database(&db, &mut cache, 1_770_000_000_000).is_some());
        assert_eq!(cache.records.len(), 1);
        assert_eq!(cache.high_water["message"], 1_780_000_004_000);

        let rewritten = quoted.replace(r#""output":20"#, r#""output":70"#);
        write(&format!(
            "UPDATE message SET data = '{rewritten}', time_updated = 1780000009000 WHERE id = 'msg_1';"
        ));
        assert!(refresh_database(&db, &mut cache, 1_770_000_000_000).is_some());
        assert_eq!(cache.records.len(), 1);
        assert_eq!(cache.records[0].tokens[OUTPUT], 75);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn database_names_match_release_channels_only() {
        let dir = std::env::temp_dir().join(format!("usage-history-opencode-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        for name in ["opencode.db", "opencode-beta.db", "opencode.db-wal", "opencode-.db", "other.db"] {
            std::fs::write(dir.join(name), b"").unwrap();
        }
        let names: Vec<String> = database_paths(&dir)
            .unwrap()
            .iter()
            .map(|path| path.file_name().unwrap().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, ["opencode-beta.db", "opencode.db"]);
        std::fs::remove_dir_all(&dir).ok();
    }
}
