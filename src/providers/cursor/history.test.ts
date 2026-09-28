import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchJson = vi.fn();
vi.mock("../../platform/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../platform/http")>()),
  fetchJson: (...args: unknown[]) => fetchJson(...args),
}));

import { HttpError } from "../../platform/http";
import {
  boundaryOverlap,
  CursorHistoryAuthError,
  cursorRateModel,
  fetchCursorUsageEvents,
} from "./history";

function event(timestamp: number, model = "claude-opus-5-high", cents = 12) {
  return {
    timestamp: String(timestamp),
    model,
    conversationId: `c-${timestamp}`,
    tokenUsage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 100, cacheWriteTokens: 2, totalCents: cents },
  };
}

beforeEach(() => fetchJson.mockReset());

describe("cursorRateModel", () => {
  it("strips Cursor's tier suffixes down to the base model", () => {
    expect(cursorRateModel("claude-fable-5-1-thinking-high")).toBe("claude-fable-5-1");
    expect(cursorRateModel("claude-opus-5-5-high-fast")).toBe("claude-opus-5-5");
    expect(cursorRateModel("cursor-grok-4.6-high-fast")).toBe("xai/grok-4.6");
    expect(cursorRateModel("gpt-6-sol")).toBe("gpt-6-sol");
  });
});

describe("boundaryOverlap", () => {
  it("finds the longest suffix/prefix overlap", () => {
    expect(boundaryOverlap(["a", "b", "c"], ["b", "c", "d"])).toBe(2);
    expect(boundaryOverlap(["a", "b"], ["c"])).toBe(0);
    expect(boundaryOverlap([], ["a"])).toBe(0);
  });
});

describe("fetchCursorUsageEvents", () => {
  it("maps events, prices from Cursor's cents, and filters the window", async () => {
    fetchJson.mockResolvedValueOnce({
      totalUsageEventsCount: 4,
      usageEventsDisplay: [event(1_000), event(2_000), event(9_000), { timestamp: "1500", model: "x" }],
    });
    const events = await fetchCursorUsageEvents("u::jwt", 0, 5_000);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      model: "claude-opus-5-high",
      rateModel: "claude-opus-5",
      sessionId: "c-1000",
      reportedCostUsd: 0.12,
      totals: { uncachedInputTokens: 10, cachedInputTokens: 100, cacheCreationTokens: 2, outputTokens: 5 },
    });
    const [, init] = fetchJson.mock.calls[0];
    expect(init.headers.Cookie).toBe("WorkosCursorSessionToken=u::jwt");
    expect(JSON.parse(init.body)).toMatchObject({ page: 1, pageSize: 1000, startDate: "0", endDate: "5000" });
  });

  it("removes rows repeated across a shifted page boundary", async () => {
    const first = Array.from({ length: 1000 }, (_, i) => event(10_000 + i));
    const second = [first[998], first[999], event(20_000)];
    fetchJson
      .mockResolvedValueOnce({ totalUsageEventsCount: 1001, usageEventsDisplay: first })
      .mockResolvedValueOnce({ totalUsageEventsCount: 1001, usageEventsDisplay: second });
    const events = await fetchCursorUsageEvents("u::jwt", 0, 100_000);
    expect(events).toHaveLength(1001);
    expect(fetchJson).toHaveBeenCalledTimes(2);
  });

  it("rejects pages that do not reconcile", async () => {
    fetchJson.mockResolvedValueOnce({ totalUsageEventsCount: 5, usageEventsDisplay: [event(1)] });
    await expect(fetchCursorUsageEvents("u::jwt", 0, 10)).rejects.toThrow(/incomplete/);
  });

  it("reports an expired session distinctly", async () => {
    fetchJson.mockRejectedValueOnce(new HttpError("HTTP 401", 401));
    await expect(fetchCursorUsageEvents("u::jwt", 0, 10)).rejects.toBeInstanceOf(CursorHistoryAuthError);
  });
});
