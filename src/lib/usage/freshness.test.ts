import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AccountFetchState, UsageResult } from "../../contracts/usage";
import { summarizeFreshness } from "./freshness";

const NOW = new Date("2026-10-07T12:00:00Z").getTime();

function result(ageMs: number): UsageResult {
  return { snapshot: { windows: [], fetchedAt: NOW - ageMs }, cached: false, stale: false };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("summarizeFreshness", () => {
  it("reports the oldest snapshot across accounts", () => {
    const states: Record<string, AccountFetchState> = {
      a: { status: "ok", result: result(10_000) },
      b: { status: "ok", result: result(5 * 60_000) },
    };
    expect(summarizeFreshness(["a", "b"], states)).toEqual({ updating: false, label: "Updated 5 min ago" });
  });

  it("is updating while any account is loading or has no state yet", () => {
    expect(summarizeFreshness(["a"], { a: { status: "loading", previous: result(0) } }).label).toBe("Updating…");
    expect(summarizeFreshness(["a"], {}).updating).toBe(true);
  });

  it("counts failures and keeps the previous snapshot's age", () => {
    const states: Record<string, AccountFetchState> = {
      a: { status: "ok", result: result(0) },
      b: { status: "error", message: "nope", previous: result(0) },
    };
    expect(summarizeFreshness(["a", "b"], states).label).toBe("Updated just now · 1 failed");
  });

  it("falls back when nothing has ever loaded", () => {
    expect(summarizeFreshness(["a"], { a: { status: "error", message: "nope" } }).label).toBe("Couldn’t update");
    expect(summarizeFreshness([], {}).label).toBe("Refresh");
  });

  it("ignores accounts that aren't listed", () => {
    const states: Record<string, AccountFetchState> = {
      a: { status: "ok", result: result(0) },
      hidden: { status: "error", message: "nope" },
    };
    expect(summarizeFreshness(["a"], states).label).toBe("Updated just now");
  });
});
