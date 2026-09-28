/** Native transcript scan for usage history. The Rust side walks
 *  `~/.claude/projects` and `~/.codex/sessions`, parses incrementally, and
 *  returns pre-aggregated buckets — raw transcripts never cross IPC. */

import { invoke } from "@tauri-apps/api/core";

import type { UsageHistoryScan } from "../contracts/usageHistory";

/** Bucket usage into the periods delimited by `boundaries` (N+1 ascending
 *  epoch-ms edges for N periods). */
export async function scanUsageHistory(boundaries: number[]): Promise<UsageHistoryScan> {
  return invoke<UsageHistoryScan>("scan_usage_history", { boundaries });
}

/** Raw `devin models list --format json`. Throws when the CLI is absent. */
export async function readDevinModelCatalog(): Promise<string> {
  return invoke<string>("devin_model_catalog");
}
