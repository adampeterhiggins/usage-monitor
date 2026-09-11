/** Usage data contracts — what provider fetchers produce and what views
 *  consume. UI-neutral: no colors, formatting, or React. */

export interface UsageWindow {
  label: string;
  usedPercent?: number;
  resetsAt?: number;
  detail?: string;
}

export interface UsageSnapshot {
  planLabel?: string;
  windows: UsageWindow[];
  fetchedAt: number;
}

export interface UsageResult {
  snapshot: UsageSnapshot;
  cached: boolean;
  stale: boolean;
}

export interface UsageFetchHooks {
  /** Persist a refreshed credential for the account being fetched. */
  persistCredential?: (credential: string) => Promise<void> | void;
}

/** UI-neutral fetch state shared by every usage view. */
export type AccountFetchState =
  | { status: "loading"; previous?: UsageResult }
  | { status: "ok"; result: UsageResult }
  | { status: "error"; message: string; previous?: UsageResult };
