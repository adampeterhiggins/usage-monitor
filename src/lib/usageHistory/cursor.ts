/** Cursor usage history for the app's Cursor accounts. Each distinct Cursor
 *  user is fetched once — two accounts signed in as the same user share
 *  one history — and events are bucketed into the dialog's periods. */

import type { Account } from "../../contracts/accounts";
import type { UsageHistoryBucket, UsageHistorySource } from "../../contracts/usageHistory";
import { fetchCursorUsageEvents, type CursorUsageEvent } from "../../providers/cursor/history";
import { credentialUserId, resolveCursorCookie } from "../../providers/cursor/usage";
import { loadAccounts } from "../accounts/document";
import type { UsageWindow } from "./window";

/** Dashboard history changes slowly; reopening the dialog shouldn't refetch
 *  90 days of pages. An explicit refresh bypasses this. */
const CACHE_TTL_MS = 5 * 60 * 1000;

export interface CursorHistory {
  buckets: UsageHistoryBucket[];
  sources: UsageHistorySource[];
}

interface CachedEvents {
  sinceMs: number;
  fetchedAtMs: number;
  events: CursorUsageEvent[];
}

export interface CursorHistoryDeps {
  accounts(): Promise<Account[]>;
  cookie(account: Account): Promise<string>;
  events(cookie: string, sinceMs: number, untilMs: number): Promise<CursorUsageEvent[]>;
  now(): number;
}

/** Index of the period containing `timestampMs`, or -1 outside the window. */
function periodOf(boundaries: readonly number[], timestampMs: number): number {
  if (timestampMs < boundaries[0] || timestampMs >= boundaries[boundaries.length - 1]) return -1;
  let low = 0;
  let high = boundaries.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (boundaries[mid] <= timestampMs) low = mid;
    else high = mid;
  }
  return low;
}

export function bucketizeCursorEvents(
  events: readonly CursorUsageEvent[],
  window: UsageWindow,
): { buckets: UsageHistoryBucket[]; sessions: number } {
  const buckets = new Map<string, UsageHistoryBucket>();
  const sessions = new Set<string>();
  for (const event of events) {
    const period = periodOf(window.boundaries, event.timestampMs);
    if (period === -1) continue;
    const costReported = event.reportedCostUsd !== null;
    const key = `${period}\u0000${event.model}\u0000${costReported}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        period,
        provider: "cursor",
        model: event.model,
        rateModel: event.rateModel,
        fast: false,
        costReported,
        reportedCostUsd: 0,
        totals: {
          uncachedInputTokens: 0,
          cachedInputTokens: 0,
          cacheCreationTokens: 0,
          outputTokens: 0,
          reasoningTokens: 0,
        },
        records: 0,
      };
      buckets.set(key, bucket);
    }
    bucket.reportedCostUsd += event.reportedCostUsd ?? 0;
    bucket.totals.uncachedInputTokens += event.totals.uncachedInputTokens;
    bucket.totals.cachedInputTokens += event.totals.cachedInputTokens;
    bucket.totals.cacheCreationTokens += event.totals.cacheCreationTokens;
    bucket.totals.outputTokens += event.totals.outputTokens;
    bucket.records += 1;
    if (event.sessionId) sessions.add(event.sessionId);
  }
  return { buckets: [...buckets.values()], sessions: sessions.size };
}

export function createCursorHistoryLoader(deps: CursorHistoryDeps) {
  const cache = new Map<string, CachedEvents>();

  return async function loadCursorHistory(window: UsageWindow, force: boolean): Promise<CursorHistory> {
    const accounts = (await deps.accounts()).filter(
      (account) => account.provider === "cursor" && !account.hidden,
    );
    const sinceMs = window.boundaries[0];
    const untilMs = Math.min(window.boundaries[window.boundaries.length - 1], deps.now());
    const seenUsers = new Set<string>();
    const buckets: UsageHistoryBucket[] = [];
    const sources: UsageHistorySource[] = [];

    for (const account of accounts) {
      const path = `cursor.com · ${account.label}`;
      let cookie: string;
      try {
        cookie = await deps.cookie(account);
      } catch (error) {
        sources.push(failedSource(path, error));
        continue;
      }
      const userId = credentialUserId(cookie) ?? cookie;
      if (seenUsers.has(userId)) continue;
      seenUsers.add(userId);

      const cached = cache.get(userId);
      const fresh =
        !force &&
        cached !== undefined &&
        cached.sinceMs <= sinceMs &&
        deps.now() - cached.fetchedAtMs < CACHE_TTL_MS;
      let events: CursorUsageEvent[];
      if (fresh) {
        events = cached.events;
      } else {
        try {
          events = await deps.events(cookie, sinceMs, untilMs);
          cache.set(userId, { sinceMs, fetchedAtMs: deps.now(), events });
        } catch (error) {
          sources.push(failedSource(path, error));
          continue;
        }
      }

      const bucketed = bucketizeCursorEvents(events, window);
      buckets.push(...bucketed.buckets);
      sources.push({
        provider: "cursor",
        path,
        status: "ok",
        scannedFiles: 1,
        skippedFiles: 0,
        distinctSessions: bucketed.sessions,
      });
    }
    return { buckets, sources };
  };
}

function failedSource(path: string, error: unknown): UsageHistorySource {
  const message = error instanceof Error ? error.message : "Cursor usage history could not be read.";
  return {
    provider: "cursor",
    path,
    status: "failed",
    scannedFiles: 0,
    skippedFiles: 0,
    distinctSessions: 0,
    message,
  };
}

export const loadCursorHistory = createCursorHistoryLoader({
  accounts: loadAccounts,
  cookie: resolveCursorCookie,
  events: fetchCursorUsageEvents,
  now: () => Date.now(),
});
