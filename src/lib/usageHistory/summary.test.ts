import { describe, expect, it } from "vitest";

import type { UsageHistoryBucket, UsageHistoryScan } from "../../contracts/usageHistory";
import { parseRateTable } from "./pricing";
import { isModelCostUnknown, summarizeUsage } from "./summary";
import { makeUsageWindow } from "./window";

const RATES = parseRateTable({
  "claude-sonnet-4-5": { input_cost_per_token: 3e-6, output_cost_per_token: 15e-6 },
  "gpt-5-codex": { input_cost_per_token: 1e-6, output_cost_per_token: 10e-6 },
});

function bucket(
  period: number,
  provider: UsageHistoryBucket["provider"],
  model: string,
  input: number,
  output: number,
): UsageHistoryBucket {
  return {
    period,
    provider,
    model,
    fast: false,
    costReported: false,
    reportedCostUsd: 0,
    totals: {
      uncachedInputTokens: input,
      cachedInputTokens: 0,
      cacheCreationTokens: 0,
      outputTokens: output,
      reasoningTokens: 0,
    },
    records: 1,
  };
}

const window = makeUsageWindow(7, new Date(2026, 8, 28, 12));

const SCAN: UsageHistoryScan = {
  buckets: [
    bucket(0, "claude", "claude-sonnet-4-5", 1_000_000, 0),
    bucket(6, "claude", "claude-sonnet-4-5", 0, 1_000_000),
    bucket(6, "codex", "gpt-5-codex", 1_000_000, 100_000),
    bucket(6, "codex", "gpt-future", 500, 500),
    bucket(99, "codex", "gpt-5-codex", 1, 1),
  ],
  sources: [
    { provider: "claude", path: "/a", status: "ok", scannedFiles: 2, skippedFiles: 0, distinctSessions: 3 },
    { provider: "codex", path: "/b", status: "ok", scannedFiles: 1, skippedFiles: 0, distinctSessions: 1 },
    { provider: "codex", path: "/c", status: "missing", scannedFiles: 0, skippedFiles: 0, distinctSessions: 0 },
  ],
  readAtMs: 0,
  scanDurationMs: 5,
};

describe("summarizeUsage", () => {
  const summary = summarizeUsage(SCAN, window, RATES);

  it("totals cost and tokens, ignoring out-of-range periods", () => {
    expect(summary.costUsd).toBeCloseTo(3 + 15 + 1 + 1);
    expect(summary.totalTokens).toBe(1_000_000 + 1_000_000 + 1_100_000 + 1_000);
    expect(summary.records).toBe(4);
    expect(summary.sessions).toBe(4);
  });

  it("keeps every period, including empty ones", () => {
    expect(summary.periods).toHaveLength(7);
    expect(summary.periods[1].totalTokens).toBe(0);
    expect(summary.periods[6].byProvider.codex?.costUsd).toBeCloseTo(2);
  });

  it("orders providers and derives shares", () => {
    expect(summary.providers.map((p) => p.provider)).toEqual(["claude", "codex"]);
    expect(summary.providers[0].costShare).toBeCloseTo(18 / 20);
  });

  it("flags models whose cost is unknown", () => {
    const future = summary.models.find((m) => m.model === "gpt-future");
    expect(future && isModelCostUnknown(future)).toBe(true);
    expect(summary.costQuality.unpricedShare).toBeCloseTo(1 / 4);
  });

  it("reports no sources only when every source is missing", () => {
    expect(summary.noSources).toBe(false);
    const nothing = summarizeUsage(
      { ...SCAN, buckets: [], sources: SCAN.sources.map((s) => ({ ...s, status: "missing" as const })) },
      window,
      RATES,
    );
    expect(nothing.noSources).toBe(true);
  });

  it("prices Devin models from its own catalog first and surfaces source notes", () => {
    const devin = summarizeUsage(
      {
        ...SCAN,
        buckets: [bucket(6, "devin", "SWE_1_7", 1_000_000, 0)],
        sources: [
          { provider: "cursor", path: "cursor.com · Work", status: "failed", scannedFiles: 0, skippedFiles: 0, distinctSessions: 0, message: "Cursor session expired" },
          { provider: "devin", path: "/d", status: "partial", scannedFiles: 1, skippedFiles: 0, distinctSessions: 1 },
        ],
      },
      window,
      RATES,
      new Map([["swe-1-7", { inputCostPerToken: 0.5e-6, outputCostPerToken: 2.5e-6, cacheReadCostPerToken: 0.2e-6, cacheCreationCostPerToken: 0.5e-6, fastMultiplier: 1 }]]),
    );
    expect(devin.costUsd).toBeCloseTo(0.5);
    expect(devin.sourceNotes).toEqual([
      "Cursor session expired",
      "Some Devin CLI history could not be read.",
    ]);
  });
});
