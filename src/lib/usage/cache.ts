import type { Account, ProviderId, UsageResult, UsageSnapshot } from "../usage-types";
import { fetchClaudeUsage } from "./claude";
import { fetchCodexUsage } from "./codex";
import { fetchCursorUsage } from "./cursor";
import { HttpError } from "../http";

const TTL_MS: Record<ProviderId, number> = {
  claude: 180_000,
  codex: 90_000,
  cursor: 90_000,
};
const DEFAULT_BACKOFF_MS = 300_000;
const LAPSE_PROBE_MS = 60_000;
const STALE_TTL_MULTIPLE = 2;
const MAX_ENTRIES = 200;

function rawFetch(account: Account): Promise<UsageSnapshot> {
  switch (account.provider) {
    case "claude":
      return fetchClaudeUsage(account);
    case "codex":
      return fetchCodexUsage(account);
    case "cursor":
      return fetchCursorUsage(account);
  }
}

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

export async function fetchUsage(account: Account, opts: { force?: boolean } = {}): Promise<UsageResult> {
  const existing = inflight.get(account.id);
  if (existing) return existing;

  const pending = fetchUsageOnce(account, opts);
  inflight.set(account.id, pending);
  try {
    return await pending;
  } finally {
    if (inflight.get(account.id) === pending) inflight.delete(account.id);
  }
}

async function fetchUsageOnce(account: Account, opts: { force?: boolean }): Promise<UsageResult> {
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
    const snapshot = await rawFetch(account);
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
