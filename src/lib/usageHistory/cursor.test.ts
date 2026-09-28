import { describe, expect, it, vi } from "vitest";

import type { Account } from "../../contracts/accounts";
import type { CursorUsageEvent } from "../../providers/cursor/history";
import { mockJwt } from "../../testing/fixtures";
import { bucketizeCursorEvents, createCursorHistoryLoader } from "./cursor";
import { makeUsageWindow } from "./window";

const window = makeUsageWindow(7, new Date(2026, 8, 28, 12));

function usage(timestampMs: number, model = "gpt-6-sol", cost: number | null = 0.1): CursorUsageEvent {
  return {
    timestampMs,
    model,
    rateModel: model,
    sessionId: `s-${model}`,
    totals: { uncachedInputTokens: 1, cachedInputTokens: 2, cacheCreationTokens: 0, outputTokens: 3, reasoningTokens: 0 },
    reportedCostUsd: cost,
  };
}

function account(id: string, hidden = false): Account {
  return { id, provider: "cursor", label: id, hidden } as Account;
}

function cookieFor(sub: string) {
  return `${sub}::${mockJwt({ sub: `auth0|${sub}`, type: "session" })}`;
}

describe("bucketizeCursorEvents", () => {
  it("groups by period and model and drops out-of-window events", () => {
    const day = window.periods[6].startMs;
    const { buckets, sessions } = bucketizeCursorEvents(
      [usage(day + 1), usage(day + 2), usage(day + 3, "claude-opus-5"), usage(window.boundaries[0] - 1)],
      window,
    );
    expect(buckets).toHaveLength(2);
    const sol = buckets.find((b) => b.model === "gpt-6-sol");
    expect(sol).toMatchObject({ period: 6, provider: "cursor", costReported: true, records: 2 });
    expect(sol?.reportedCostUsd).toBeCloseTo(0.2);
    expect(sessions).toBe(2);
  });
});

describe("loadCursorHistory", () => {
  it("fetches each Cursor user once, skips hidden accounts, and caches", async () => {
    const events = vi.fn(async () => [usage(window.periods[6].startMs + 10)]);
    let now = window.periods[6].startMs + 60_000;
    const load = createCursorHistoryLoader({
      accounts: async () => [account("a"), account("b"), account("c", true), { ...account("d"), provider: "claude" } as Account],
      cookie: async (acct) => cookieFor(acct.id === "b" ? "a" : acct.id),
      events,
      now: () => now,
    });

    const first = await load(window, false);
    expect(events).toHaveBeenCalledTimes(1);
    expect(first.sources).toHaveLength(1);
    expect(first.buckets[0].records).toBe(1);

    now += 60_000;
    await load(window, false);
    expect(events).toHaveBeenCalledTimes(1);
    await load(window, true);
    expect(events).toHaveBeenCalledTimes(2);
  });

  it("reports a failed account without failing the others", async () => {
    const load = createCursorHistoryLoader({
      accounts: async () => [account("a"), account("b")],
      cookie: async (acct) => {
        if (acct.id === "a") throw new Error("Cursor login not found.");
        return cookieFor("b");
      },
      events: async () => [],
      now: () => window.referenceMs,
    });
    const { sources } = await load(window, false);
    expect(sources.map((s) => [s.path, s.status, s.message])).toEqual([
      ["cursor.com · a", "failed", "Cursor login not found."],
      ["cursor.com · b", "ok", undefined],
    ]);
  });
});
