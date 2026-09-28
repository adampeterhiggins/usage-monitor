/** Usage History state: the selected window and metric, and the latest
 *  priced summary. A factory so tests can inject the scan and rate loader
 *  without the native bridge. */

import { create } from "zustand";

import type {
  UsageHistoryMetric,
  UsageHistoryScan,
  UsageWindowDays,
} from "../contracts/usageHistory";
import {
  DEFAULT_USAGE_HISTORY_PREFERENCES,
  getUsageHistoryPreferences,
  setUsageHistoryPreferences,
  type UsageHistoryPreferences,
} from "../lib/settings/usageHistory";
import {
  loadCursorHistory,
  loadUsageRates,
  makeUsageWindow,
  summarizeUsage,
  type CursorHistory,
  type UsageHistorySummary,
  type UsagePricingInfo,
  type UsageRates,
  type UsageWindow,
} from "../lib/usageHistory";
import { scanUsageHistory } from "../platform/usageHistory";

export interface UsageHistoryService {
  windowDays: UsageWindowDays;
  metric: UsageHistoryMetric;
  status: "idle" | "loading" | "ready" | "error";
  /** A reload is running behind a summary that stays on screen. */
  refreshing: boolean;
  window: UsageWindow | null;
  summary: UsageHistorySummary | null;
  pricing: UsagePricingInfo | null;
  scanDurationMs: number | null;
  error: string | null;
  /** Hydrate preferences once, then rescan — warm scans are cheap. */
  open(): Promise<void>;
  setWindowDays(days: UsageWindowDays): void;
  setMetric(metric: UsageHistoryMetric): void;
  /** Rescan and refetch rates ahead of their TTL. */
  refresh(): Promise<void>;
}

export interface UsageHistoryDeps {
  scan(boundaries: number[]): Promise<UsageHistoryScan>;
  rates(force: boolean): Promise<UsageRates>;
  /** Cursor's dashboard history for the app's Cursor accounts. */
  cursor(window: UsageWindow, force: boolean): Promise<CursorHistory>;
  readPreferences(): Promise<UsageHistoryPreferences>;
  writePreferences(next: UsageHistoryPreferences): Promise<void>;
  now(): Date;
}

export function createUsageHistoryService(deps: UsageHistoryDeps) {
  let hydrated = false;
  /** A choice made before hydration lands must not be overwritten by it. */
  let touched = false;
  let requestId = 0;

  return create<UsageHistoryService>((set, get) => {
    async function load(forceRates: boolean, keepSummary: boolean): Promise<void> {
      const id = ++requestId;
      const window = makeUsageWindow(get().windowDays, deps.now());
      set({
        status: "loading",
        refreshing: keepSummary,
        error: null,
        ...(keepSummary ? {} : { summary: null, window }),
      });
      try {
        const [scan, { rates, devinRates, pricing }, cursor] = await Promise.all([
          deps.scan(window.boundaries),
          deps.rates(forceRates),
          deps.cursor(window, forceRates),
        ]);
        if (id !== requestId) return;
        const merged: UsageHistoryScan = {
          ...scan,
          buckets: [...scan.buckets, ...cursor.buckets],
          sources: [...scan.sources, ...cursor.sources],
        };
        set({
          status: "ready",
          refreshing: false,
          window,
          summary: summarizeUsage(merged, window, rates, devinRates),
          pricing,
          scanDurationMs: scan.scanDurationMs,
        });
      } catch (error) {
        if (id !== requestId) return;
        set({
          status: "error",
          refreshing: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    function persist() {
      const { windowDays, metric } = get();
      void deps.writePreferences({ windowDays, metric }).catch(() => undefined);
    }

    return {
      ...DEFAULT_USAGE_HISTORY_PREFERENCES,
      status: "idle",
      refreshing: false,
      window: null,
      summary: null,
      pricing: null,
      scanDurationMs: null,
      error: null,

      async open() {
        if (!hydrated) {
          hydrated = true;
          const preferences = await deps.readPreferences().catch(
            () => DEFAULT_USAGE_HISTORY_PREFERENCES,
          );
          if (!touched) set(preferences);
        }
        const { summary, window, windowDays } = get();
        await load(false, summary !== null && window?.days === windowDays);
      },

      setWindowDays(days) {
        if (days === get().windowDays && get().status !== "error") return;
        touched = true;
        set({ windowDays: days });
        persist();
        void load(false, false);
      },

      setMetric(metric) {
        if (metric === get().metric) return;
        touched = true;
        set({ metric });
        persist();
      },

      async refresh() {
        await load(true, get().summary !== null);
      },
    };
  });
}

export const useUsageHistoryStore = createUsageHistoryService({
  scan: scanUsageHistory,
  rates: loadUsageRates,
  cursor: loadCursorHistory,
  readPreferences: getUsageHistoryPreferences,
  writePreferences: setUsageHistoryPreferences,
  now: () => new Date(),
});
