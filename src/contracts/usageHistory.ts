/** Usage history contracts — token usage from the Claude Code, Codex, and
 *  Grok CLIs' transcripts, the Devin CLI's, OpenCode's, and Antigravity's
 *  SQLite stores (all scanned natively), and Cursor's dashboard API. Ported
 *  from t3code's usage contract. UI-neutral. */

export type UsageHistoryProvider =
  | "claude"
  | "codex"
  | "cursor"
  | "devin"
  | "grok"
  | "opencode"
  | "antigravity";

export type UsageWindowDays = 1 | 7 | 30 | 90;

export type UsageHistoryMetric = "cost" | "tokens";

/** Cached input and cache creation are disjoint from uncached input;
 *  summing all three gives total input. `reasoningTokens` is a *subset* of
 *  `outputTokens` and must never be added on top. */
export interface UsageTokenTotals {
  uncachedInputTokens: number;
  cachedInputTokens: number;
  cacheCreationTokens: number;
  outputTokens: number;
  reasoningTokens: number;
}

/** One `(period, provider, model, fast, costReported)` cell. `period`
 *  indexes the boundaries the scan was asked for. Fast mode and
 *  provider-reported cost are split out because they price differently. */
export interface UsageHistoryBucket {
  period: number;
  provider: UsageHistoryProvider;
  model: string;
  /** Rate-table key when the display name carries tiers the table does not
   *  know, such as Cursor's `claude-opus-5-5-high`. Defaults to `model`. */
  rateModel?: string;
  fast: boolean;
  costReported: boolean;
  reportedCostUsd: number;
  totals: UsageTokenTotals;
  /** Distinct assistant responses, after de-duplication. */
  records: number;
}

export interface UsageHistorySource {
  provider: UsageHistoryProvider;
  path: string;
  /** `partial`: readable history exists but this read failed or was
   *  incomplete; `failed`: nothing could be read. */
  status: "ok" | "missing" | "partial" | "failed";
  message?: string;
  scannedFiles: number;
  skippedFiles: number;
  /** Distinct sessions with in-window usage — the figure to total, since a
   *  session spans periods and models. */
  distinctSessions: number;
}

export interface UsageHistoryScan {
  buckets: UsageHistoryBucket[];
  sources: UsageHistorySource[];
  readAtMs: number;
  scanDurationMs: number;
}
