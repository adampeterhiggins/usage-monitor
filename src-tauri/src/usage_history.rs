//! Usage history: token usage read from the Claude Code and Codex CLIs'
//! local session transcripts and the Devin CLI's session database, ported
//! from t3code's `UsageService`. Cursor history comes from its dashboard API
//! and is fetched by the frontend.
//!
//! The frontend passes the period boundaries it wants (local midnights, or
//! hourly steps for a rolling 24 hours) and gets back pre-aggregated
//! `(period, provider, model)` buckets. Raw transcripts never cross IPC: a
//! 30-day window can be over a gigabyte of JSONL.
//!
//! Parsed records are memoised per file by `(size, mtime)`; a file that only
//! grew resumes from its cached parse position. The cache is persisted so
//! history survives Claude Code pruning old transcripts and app restarts.

mod devin;
mod parse;
mod reader;

pub(crate) use devin::model_catalog as devin_model_catalog;

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use parse::{fnv1a64, Provider, Tokens, UsageRecord};
use reader::ParsePosition;

/// Files are filtered by mtime before opening. The slack covers a session
/// whose last write lands just before the window's first boundary.
const MTIME_SLACK_MS: i64 = 36 * 60 * 60 * 1000;

/// Longest window the UI offers, plus slack. Older cache entries are pruned.
const CACHE_RETENTION_MS: i64 = 92 * 24 * 60 * 60 * 1000;

const MAX_PERIODS: usize = 10_000;
const CACHE_VERSION: u32 = 1;

#[derive(Clone, Serialize, Deserialize)]
struct FileEntry {
    size: u64,
    mtime_ms: i64,
    provider: Provider,
    records: Vec<UsageRecord>,
    tail_records: Vec<UsageRecord>,
    position: ParsePosition,
}

#[derive(Default)]
struct ScanCache {
    files: HashMap<String, FileEntry>,
    devin: devin::DevinCache,
    loaded: bool,
    dirty: bool,
}

#[derive(Serialize, Deserialize)]
struct PersistedCache {
    version: u32,
    files: HashMap<String, FileEntry>,
    #[serde(default)]
    devin: devin::DevinCache,
}

fn cache() -> &'static Mutex<ScanCache> {
    static CACHE: OnceLock<Mutex<ScanCache>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(ScanCache::default()))
}

#[derive(Serialize, Clone, Copy, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TokenTotals {
    uncached_input_tokens: u64,
    cached_input_tokens: u64,
    cache_creation_tokens: u64,
    output_tokens: u64,
    reasoning_tokens: u64,
}

impl TokenTotals {
    fn add(&mut self, tokens: &Tokens) {
        self.uncached_input_tokens += tokens[parse::UNCACHED_INPUT];
        self.cached_input_tokens += tokens[parse::CACHED_INPUT];
        self.cache_creation_tokens += tokens[parse::CACHE_CREATION];
        self.output_tokens += tokens[parse::OUTPUT];
        self.reasoning_tokens += tokens[parse::REASONING];
    }
}

/// One `(period, provider, model, fast, costReported)` cell. Pricing is
/// linear in tokens, so the frontend can price a whole cell at once; fast
/// mode and provider-reported cost are split out because they price
/// differently.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UsageHistoryBucket {
    period: usize,
    provider: Provider,
    model: String,
    fast: bool,
    cost_reported: bool,
    reported_cost_usd: f64,
    totals: TokenTotals,
    records: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum SourceStatus {
    Ok,
    Missing,
    /// The source exists but could not be read this time; cached history
    /// still counts.
    Partial,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UsageHistorySource {
    provider: Provider,
    path: String,
    status: SourceStatus,
    scanned_files: u64,
    skipped_files: u64,
    /// Distinct sessions with in-window usage. Sessions span periods and
    /// models, so per-bucket counts would overcount; this is the figure to total.
    distinct_sessions: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UsageHistoryScan {
    buckets: Vec<UsageHistoryBucket>,
    sources: Vec<UsageHistorySource>,
    read_at_ms: i64,
    scan_duration_ms: u64,
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

fn env_dir(key: &str) -> Option<PathBuf> {
    std::env::var_os(key)
        .map(PathBuf::from)
        .filter(|path| !path.as_os_str().is_empty())
}

/// Transcript directories, in scan order. Claude Code writes to
/// `~/.config/claude` on newer installs and `~/.claude` on older ones; Codex
/// moves archived rollouts out of `sessions`. Moved copies de-duplicate.
fn transcript_dirs() -> Vec<(Provider, PathBuf)> {
    let mut dirs = Vec::new();
    let home = home();
    match env_dir("CLAUDE_CONFIG_DIR") {
        Some(dir) => dirs.push((Provider::Claude, dir.join("projects"))),
        None => {
            if let Some(home) = &home {
                dirs.push((Provider::Claude, home.join(".config/claude/projects")));
                dirs.push((Provider::Claude, home.join(".claude/projects")));
            }
        }
    }
    let codex_home = env_dir("CODEX_HOME").or_else(|| home.as_ref().map(|h| h.join(".codex")));
    if let Some(codex_home) = codex_home {
        dirs.push((Provider::Codex, codex_home.join("sessions")));
        dirs.push((Provider::Codex, codex_home.join("archived_sessions")));
    }

    let mut seen = HashSet::new();
    dirs.into_iter()
        .map(|(provider, dir)| (provider, std::fs::canonicalize(&dir).unwrap_or(dir)))
        .filter(|(provider, dir)| seen.insert((*provider, dir.clone())))
        .collect()
}

fn load_persisted(cache: &mut ScanCache, path: Option<&Path>) {
    if cache.loaded {
        return;
    }
    cache.loaded = true;
    let Some(path) = path else { return };
    let Ok(raw) = std::fs::read(path) else { return };
    let Ok(persisted) = serde_json::from_slice::<PersistedCache>(&raw) else { return };
    if persisted.version == CACHE_VERSION {
        cache.files = persisted.files;
        cache.devin = persisted.devin;
    }
}

fn persist(cache: &mut ScanCache, path: Option<&Path>) {
    if !cache.dirty {
        return;
    }
    let Some(path) = path else { return };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let document = PersistedCache {
        version: CACHE_VERSION,
        files: std::mem::take(&mut cache.files),
        devin: std::mem::take(&mut cache.devin),
    };
    let written = serde_json::to_vec(&document).ok().and_then(|bytes| {
        let temp = path.with_extension("json.tmp");
        std::fs::write(&temp, bytes).ok()?;
        std::fs::rename(&temp, path).ok()
    });
    cache.files = document.files;
    cache.devin = document.devin;
    // Cleared only after the write lands, so a failed persist retries next scan.
    if written.is_some() {
        cache.dirty = false;
    }
}

/// Parses one transcript, reusing the cached result when it is unchanged.
fn read_file_records<'a>(
    cache: &'a mut ScanCache,
    file: &reader::TranscriptFile,
    provider: Provider,
) -> Option<&'a FileEntry> {
    let key = file.path.to_string_lossy().into_owned();
    let cached = cache.files.get(&key);
    let fresh = cached.is_some_and(|entry| {
        entry.size == file.size && entry.mtime_ms == file.mtime_ms && entry.provider == provider
    });
    if !fresh {
        // Only a strictly grown file may resume; same size with a new mtime,
        // or a shrunken file, means rewritten content.
        let resume = cached
            .filter(|entry| entry.provider == provider && file.size > entry.size)
            .map(|entry| &entry.position);
        // A read failure is not an empty transcript: keep serving the old parse.
        if let Some(parsed) = reader::read_transcript_records(&file.path, provider, resume) {
            let mut records = if parsed.resumed {
                cached.map(|entry| entry.records.clone()).unwrap_or_default()
            } else {
                Vec::new()
            };
            records.extend(parsed.records);
            // Stored de-duplicated within the file, which is nearly all
            // duplicates; the scan still runs the cross-file pass.
            let mut seen = HashSet::new();
            records.retain(|r| r.dedupe_key.is_none_or(|key| seen.insert(key)));
            let mut tail_records = parsed.tail_records;
            tail_records.retain(|r| r.dedupe_key.is_none_or(|key| seen.insert(key)));
            cache.files.insert(
                key.clone(),
                FileEntry {
                    size: file.size,
                    mtime_ms: file.mtime_ms,
                    provider,
                    records,
                    tail_records,
                    position: parsed.position,
                },
            );
            cache.dirty = true;
        }
    }
    cache.files.get(&key).filter(|entry| entry.provider == provider)
}

#[derive(Hash, PartialEq, Eq)]
struct BucketKey {
    period: usize,
    provider: Provider,
    model: String,
    fast: bool,
    cost_reported: bool,
}

#[derive(Default)]
struct BucketAcc {
    totals: TokenTotals,
    reported_cost_usd: f64,
    records: u64,
}

/// Folds records into period buckets with a single global de-duplication
/// pass: Claude Code copies a message's records forward when a session is
/// resumed or forked, so one key legitimately appears in several files.
struct Aggregator<'a> {
    boundaries: &'a [i64],
    seen: HashSet<u64>,
    buckets: HashMap<BucketKey, BucketAcc>,
}

impl Aggregator<'_> {
    fn period_of(&self, timestamp_ms: i64) -> Option<usize> {
        let first = *self.boundaries.first()?;
        let last = *self.boundaries.last()?;
        if timestamp_ms < first || timestamp_ms >= last {
            return None;
        }
        Some(self.boundaries.partition_point(|&edge| edge <= timestamp_ms) - 1)
    }

    /// Returns whether the record landed in the window.
    fn add(&mut self, record: &UsageRecord, dedupe_key: Option<u64>) -> bool {
        if let Some(key) = dedupe_key {
            if !self.seen.insert(key) {
                return false;
            }
        }
        let Some(period) = self.period_of(record.timestamp_ms) else {
            return false;
        };
        let cost_reported = record.reported_cost_usd.is_some();
        let bucket = self
            .buckets
            .entry(BucketKey {
                period,
                provider: record.provider,
                model: record.model.clone(),
                fast: record.fast,
                cost_reported,
            })
            .or_default();
        bucket.totals.add(&record.tokens);
        bucket.reported_cost_usd += record.reported_cost_usd.unwrap_or(0.0);
        bucket.records += 1;
        true
    }
}

/// Codex rollouts carry no event id. Match moved copies of a rollout by
/// content, while an occurrence index keeps repeated equal events within one
/// file (second-precision timestamps) from collapsing.
fn codex_dedupe_key(record: &UsageRecord, occurrences: &mut HashMap<u64, u32>) -> Option<u64> {
    if record.session_id.is_empty() {
        return None;
    }
    let tokens: Vec<u8> = record.tokens.iter().flat_map(|t| t.to_le_bytes()).collect();
    let base = fnv1a64(&[
        b"codex",
        record.session_id.as_bytes(),
        &record.timestamp_ms.to_le_bytes(),
        record.model.as_bytes(),
        &tokens,
    ]);
    let occurrence = occurrences.entry(base).or_insert(0);
    *occurrence += 1;
    Some(fnv1a64(&[&base.to_le_bytes(), &occurrence.to_le_bytes()]))
}

fn validate_boundaries(boundaries: &[i64]) -> Result<(), String> {
    if boundaries.len() < 2 || boundaries.len() > MAX_PERIODS + 1 {
        return Err("Usage history needs between 1 and 10,000 periods.".into());
    }
    if boundaries.windows(2).any(|pair| pair[0] >= pair[1]) {
        return Err("Usage history period boundaries must be strictly increasing.".into());
    }
    Ok(())
}

/// Scans every transcript directory and buckets usage into the periods
/// delimited by `boundaries` (N+1 ascending epoch-ms edges for N periods).
pub(crate) fn scan(cache_path: Option<&Path>, boundaries: &[i64]) -> Result<UsageHistoryScan, String> {
    validate_boundaries(boundaries)?;
    let started = Instant::now();
    let now = now_ms();
    let window_start_ms = boundaries[0] - MTIME_SLACK_MS;
    let retention_cutoff_ms = now - CACHE_RETENTION_MS;

    let mut cache = cache().lock().map_err(|_| "Usage history cache is unavailable.".to_string())?;
    load_persisted(&mut cache, cache_path);

    let mut aggregator = Aggregator { boundaries, seen: HashSet::new(), buckets: HashMap::new() };
    let mut sources = Vec::new();

    for (provider, dir) in transcript_dirs() {
        let exists = dir.is_dir();
        let listed = if exists { reader::list_transcript_files(&dir, window_start_ms) } else { Vec::new() };

        let mut file_keys: Vec<String> = Vec::with_capacity(listed.len());
        for file in &listed {
            if read_file_records(&mut cache, file, provider).is_some() {
                file_keys.push(file.path.to_string_lossy().into_owned());
            }
        }
        // Transcripts the CLI has since pruned still count: their usage was
        // saved when we last parsed them.
        let live: HashSet<&Path> = listed.iter().map(|file| file.path.as_path()).collect();
        for (path, entry) in &cache.files {
            if entry.provider == provider
                && entry.mtime_ms >= window_start_ms
                && Path::new(path).starts_with(&dir)
                && !live.contains(Path::new(path))
            {
                file_keys.push(path.clone());
            }
        }

        let mut scanned_files = 0;
        let mut skipped_files = 0;
        let mut sessions: HashSet<&str> = HashSet::new();
        for key in &file_keys {
            let Some(entry) = cache.files.get(key) else { continue };
            if entry.records.is_empty() && entry.tail_records.is_empty() {
                skipped_files += 1;
                continue;
            }
            scanned_files += 1;
            let mut occurrences = HashMap::new();
            for record in entry.records.iter().chain(&entry.tail_records) {
                let dedupe_key = match provider {
                    Provider::Codex => codex_dedupe_key(record, &mut occurrences),
                    Provider::Claude | Provider::Devin => record.dedupe_key,
                };
                if aggregator.add(record, dedupe_key) && !record.session_id.is_empty() {
                    sessions.insert(record.session_id.as_str());
                }
            }
        }

        sources.push(UsageHistorySource {
            provider,
            path: dir.to_string_lossy().into_owned(),
            status: if !exists && scanned_files == 0 { SourceStatus::Missing } else { SourceStatus::Ok },
            scanned_files,
            skipped_files,
            distinct_sessions: sessions.len() as u64,
        });
    }

    if let Some(dir) = devin::devin_cli_dir() {
        let (read, changed) = devin::refresh(&mut cache.devin, retention_cutoff_ms);
        if changed {
            cache.dirty = true;
        }
        let mut sessions: HashSet<&str> = HashSet::new();
        for record in &cache.devin.records {
            if aggregator.add(record, record.dedupe_key) && !record.session_id.is_empty() {
                sessions.insert(record.session_id.as_str());
            }
        }
        let has_history = !cache.devin.records.is_empty();
        sources.push(UsageHistorySource {
            provider: Provider::Devin,
            path: dir.join("sessions.db").to_string_lossy().into_owned(),
            status: match read {
                devin::DevinRead::Missing if !has_history => SourceStatus::Missing,
                devin::DevinRead::Failed => SourceStatus::Partial,
                _ => SourceStatus::Ok,
            },
            scanned_files: u64::from(has_history),
            skipped_files: 0,
            distinct_sessions: sessions.len() as u64,
        });
    }

    let before = cache.files.len();
    cache.files.retain(|_, entry| entry.mtime_ms >= retention_cutoff_ms);
    if cache.files.len() != before {
        cache.dirty = true;
    }
    persist(&mut cache, cache_path);

    let mut buckets: Vec<UsageHistoryBucket> = aggregator
        .buckets
        .into_iter()
        .map(|(key, acc)| UsageHistoryBucket {
            period: key.period,
            provider: key.provider,
            model: key.model,
            fast: key.fast,
            cost_reported: key.cost_reported,
            reported_cost_usd: acc.reported_cost_usd,
            totals: acc.totals,
            records: acc.records,
        })
        .collect();
    // Stable ordering keeps payloads diffable.
    buckets.sort_by(|a, b| {
        (a.period, a.provider as u8, &a.model, a.fast, a.cost_reported)
            .cmp(&(b.period, b.provider as u8, &b.model, b.fast, b.cost_reported))
    });

    Ok(UsageHistoryScan {
        buckets,
        sources,
        read_at_ms: now,
        scan_duration_ms: started.elapsed().as_millis() as u64,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record(ts: i64, key: Option<u64>) -> UsageRecord {
        UsageRecord {
            provider: Provider::Claude,
            timestamp_ms: ts,
            model: "claude-sonnet-4-5".into(),
            session_id: "s".into(),
            tokens: [1, 2, 3, 4, 0],
            reported_cost_usd: None,
            fast: false,
            dedupe_key: key,
        }
    }

    #[test]
    fn buckets_by_boundary_and_dedupes_globally() {
        let boundaries = [0, 100, 200];
        let mut aggregator = Aggregator { boundaries: &boundaries, seen: HashSet::new(), buckets: HashMap::new() };
        assert!(aggregator.add(&record(0, Some(1)), Some(1)));
        assert!(!aggregator.add(&record(0, Some(1)), Some(1)));
        assert!(aggregator.add(&record(150, None), None));
        assert!(aggregator.add(&record(199, None), None));
        assert!(!aggregator.add(&record(200, None), None));
        assert!(!aggregator.add(&record(-1, None), None));
        let mut periods: Vec<(usize, u64)> =
            aggregator.buckets.iter().map(|(k, v)| (k.period, v.records)).collect();
        periods.sort();
        assert_eq!(periods, vec![(0, 1), (1, 2)]);
    }

    #[test]
    fn codex_keys_match_across_files_but_not_within() {
        let mut codex = record(5, None);
        codex.provider = Provider::Codex;
        let mut first_file = HashMap::new();
        let a1 = codex_dedupe_key(&codex, &mut first_file);
        let a2 = codex_dedupe_key(&codex, &mut first_file);
        assert_ne!(a1, a2);
        let mut moved_copy = HashMap::new();
        assert_eq!(codex_dedupe_key(&codex, &mut moved_copy), a1);
    }

    #[test]
    fn rejects_bad_boundaries() {
        assert!(validate_boundaries(&[1]).is_err());
        assert!(validate_boundaries(&[2, 1]).is_err());
        assert!(validate_boundaries(&[1, 2, 3]).is_ok());
    }
}
