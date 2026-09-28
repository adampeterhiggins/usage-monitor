import { describe, expect, it } from "vitest";

import type { UsageHistoryScan } from "../contracts/usageHistory";
import type { UsageHistoryPreferences } from "../lib/settings/usageHistory";
import { parseRateTable } from "../lib/usageHistory";
import { createUsageHistoryService, type UsageHistoryDeps } from "./usageHistory";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function scanWith(output: number): UsageHistoryScan {
  return {
    buckets: [
      {
        period: 0,
        provider: "claude",
        model: "claude-sonnet-4-5",
        fast: false,
        costReported: false,
        reportedCostUsd: 0,
        totals: {
          uncachedInputTokens: 0,
          cachedInputTokens: 0,
          cacheCreationTokens: 0,
          outputTokens: output,
          reasoningTokens: 0,
        },
        records: 1,
      },
    ],
    sources: [],
    readAtMs: 0,
    scanDurationMs: 1,
  };
}

function deps(overrides: Partial<UsageHistoryDeps> = {}) {
  const written: UsageHistoryPreferences[] = [];
  const boundaries: number[][] = [];
  const value: UsageHistoryDeps = {
    scan: async (edges) => {
      boundaries.push(edges);
      return scanWith(1_000_000);
    },
    rates: async () => ({
      rates: parseRateTable({
        "claude-sonnet-4-5": { input_cost_per_token: 3e-6, output_cost_per_token: 15e-6 },
      }),
      devinRates: new Map(),
      pricing: { status: "fresh", fetchedAtMs: 0, knownModels: 1 },
    }),
    cursor: async () => ({ buckets: [], sources: [] }),
    readPreferences: async () => ({ windowDays: 7, metric: "tokens" }),
    writePreferences: async (next) => {
      written.push(next);
    },
    now: () => new Date(2026, 8, 28, 12),
    ...overrides,
  };
  return { value, written, boundaries };
}

describe("usage history service", () => {
  it("hydrates preferences and loads a priced summary", async () => {
    const { value, boundaries } = deps();
    const service = createUsageHistoryService(value);
    await service.getState().open();
    const state = service.getState();
    expect(state.windowDays).toBe(7);
    expect(state.metric).toBe("tokens");
    expect(state.status).toBe("ready");
    expect(state.summary?.costUsd).toBeCloseTo(15);
    expect(boundaries[0]).toHaveLength(8);
  });

  it("drops a stale response when the window changes mid-scan", async () => {
    const slow = deferred<UsageHistoryScan>();
    let calls = 0;
    const { value, written } = deps({
      scan: () => (calls++ === 0 ? slow.promise : Promise.resolve(scanWith(2_000_000))),
    });
    const service = createUsageHistoryService(value);
    const opening = service.getState().open();
    await Promise.resolve();
    await Promise.resolve();
    service.getState().setWindowDays(30);
    slow.resolve(scanWith(1));
    await opening;
    await new Promise((resolve) => setTimeout(resolve, 0));

    const state = service.getState();
    expect(state.window?.days).toBe(30);
    expect(state.summary?.totalTokens).toBe(2_000_000);
    expect(written[written.length - 1]).toEqual({ windowDays: 30, metric: "tokens" });
  });

  it("keeps the summary visible through a refresh and reports errors", async () => {
    let fail = false;
    const { value } = deps({
      scan: async () => {
        if (fail) throw new Error("scan failed");
        return scanWith(1);
      },
    });
    const service = createUsageHistoryService(value);
    await service.getState().open();
    fail = true;
    const refreshing = service.getState().refresh();
    expect(service.getState().refreshing).toBe(true);
    expect(service.getState().summary).not.toBeNull();
    await refreshing;
    expect(service.getState()).toMatchObject({ status: "error", error: "scan failed", refreshing: false });
  });
});
