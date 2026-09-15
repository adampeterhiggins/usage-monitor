import type { Account } from "../../contracts/accounts";
import type { ProviderId } from "../../contracts/providers";
import type { UsageFetchHooks, UsageResult, UsageSnapshot } from "../../contracts/usage";
import { fetchProviderUsage } from "../../providers/registry";
import { HttpError } from "../../platform/http";

const TTL_MS: Record<ProviderId, number> = {
  claude: 180_000,
  codex: 90_000,
  cursor: 90_000,
  devin: 90_000,
};
const DEFAULT_BACKOFF_MS = 300_000;
const LAPSE_PROBE_MS = 60_000;
const STALE_TTL_MULTIPLE = 2;
const MAX_ENTRIES = 200;
/** Ceiling on one fetch — above the worst legit chain of ~2 HTTP calls at the
 *  native 30s timeout, so a stalled request (or a Keychain prompt nobody
 *  answered) ends in an error state instead of loading forever. */
const FETCH_TIMEOUT_MS = 90_000;

const rawFetch = fetchProviderUsage;

const snapshots = new Map<string, UsageSnapshot>();
const backoffUntil = new Map<string, number>();
const lastLapseProbe = new Map<string, number>();
const inflight = new Map<string, Promise<UsageResult>>();

function evictIfNeeded(): void {
  while (snapshots.size > MAX_ENTRIES) {
    const oldest = snapshots.keys().next().value;
    if (oldest === undefined) break;
    snapshots.delete(oldest);
  }
}

function hasLapsedWindow(snapshot: UsageSnapshot): boolean {
  return snapshot.windows.some((w) => w.resetsAt !== undefined && w.resetsAt <= Date.now());
}

function isSnapshotStale(account: Account, snapshot: UsageSnapshot): boolean {
  return (
    hasLapsedWindow(snapshot) ||
    Date.now() - snapshot.fetchedAt >= TTL_MS[account.provider] * STALE_TTL_MULTIPLE
  );
}

export interface FetchUsageOptions extends UsageFetchHooks {
  force?: boolean;
}

/** Race a fetch against the ceiling. A timeout rejects the returned promise
 *  so the caller's inflight slot frees and a retry really retries — while the
 *  inner fetch keeps running and may still land its snapshot in the cache. */
function boundedFetch(account: Account, opts: FetchUsageOptions): Promise<UsageResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            "Timed out — check for a hidden macOS Keychain prompt, then try again.",
          ),
        ),
      FETCH_TIMEOUT_MS,
    );
  });
  return Promise.race([fetchUsageOnce(account, opts), timeout]).finally(() =>
    clearTimeout(timer),
  );
}

export async function fetchUsage(account: Account, opts: FetchUsageOptions = {}): Promise<UsageResult> {
  const existing = inflight.get(account.id);
  if (existing) return existing;

  const pending = boundedFetch(account, opts);
  inflight.set(account.id, pending);
  try {
    return await pending;
  } finally {
    if (inflight.get(account.id) === pending) inflight.delete(account.id);
  }
}

async function fetchUsageOnce(account: Account, opts: FetchUsageOptions): Promise<UsageResult> {
  const cached = snapshots.get(account.id);
  const age = cached ? Date.now() - cached.fetchedAt : Infinity;

  const probeDue =
    !!cached && hasLapsedWindow(cached) && Date.now() - (lastLapseProbe.get(account.id) ?? 0) >= LAPSE_PROBE_MS;

  if (cached && !opts.force && !probeDue && age < TTL_MS[account.provider]) {
    return { snapshot: cached, cached: true, stale: isSnapshotStale(account, cached) };
  }

  const backoffLeft = (backoffUntil.get(account.id) ?? 0) - Date.now();
  if (backoffLeft > 0 && !probeDue) {
    if (cached) return { snapshot: cached, cached: true, stale: isSnapshotStale(account, cached) };
    throw new Error(
      `Rate limited — backing off for another ${Math.ceil(backoffLeft / 60000)} min before retrying automatically.`,
    );
  }
  if (probeDue) lastLapseProbe.set(account.id, Date.now());

  try {
    const snapshot = await rawFetch(account, opts);
    snapshots.set(account.id, snapshot);
    evictIfNeeded();
    backoffUntil.delete(account.id);
    lastLapseProbe.delete(account.id);
    return { snapshot, cached: false, stale: isSnapshotStale(account, snapshot) };
  } catch (e) {
    if (e instanceof HttpError && e.status === 429) {
      const backoffMs = (e.retryAfterSeconds ?? DEFAULT_BACKOFF_MS / 1000) * 1000;
      backoffUntil.set(account.id, Date.now() + backoffMs);
      if (cached) return { snapshot: cached, cached: true, stale: isSnapshotStale(account, cached) };
      throw new Error(
        `Rate limited by the provider. Will retry automatically in ~${Math.ceil(backoffMs / 60000)} min.`,
      );
    }
    throw e;
  }
}

export function invalidate(accountId: string): void {
  snapshots.delete(accountId);
  backoffUntil.delete(accountId);
  lastLapseProbe.delete(accountId);
  inflight.delete(accountId);
}
