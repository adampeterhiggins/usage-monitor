import { describe, expect, it } from "vitest";

import { formatDayShort, formatShare, formatTokens, formatUsd } from "./format";
import { makeUsageWindow } from "./window";

describe("makeUsageWindow", () => {
  const now = new Date(2026, 8, 28, 11, 28, 42);

  it("cuts local-midnight days ending tomorrow", () => {
    const window = makeUsageWindow(7, now);
    expect(window.resolution).toBe("day");
    expect(window.periods.map((p) => p.key)).toEqual([
      "2026-09-22",
      "2026-09-23",
      "2026-09-24",
      "2026-09-25",
      "2026-09-26",
      "2026-09-27",
      "2026-09-28",
    ]);
    expect(window.boundaries).toHaveLength(8);
    expect(window.boundaries[0]).toBe(new Date(2026, 8, 22).getTime());
    expect(window.boundaries[7]).toBe(new Date(2026, 8, 29).getTime());
  });

  it("uses 24 fixed hours from a minute-aligned now", () => {
    const window = makeUsageWindow(1, now);
    expect(window.resolution).toBe("hour");
    expect(window.periods).toHaveLength(24);
    const until = new Date(2026, 8, 28, 11, 28).getTime();
    expect(window.boundaries[24]).toBe(until);
    expect(window.boundaries[0]).toBe(until - 24 * 3_600_000);
    for (let i = 1; i < window.boundaries.length; i += 1) {
      expect(window.boundaries[i]).toBeGreaterThan(window.boundaries[i - 1]);
    }
  });
});

describe("format", () => {
  it("compacts token counts", () => {
    expect(formatTokens(804_123)).toBe("804K");
    expect(formatTokens(76_740_000)).toBe("76.7M");
    expect(formatTokens(19_900_000_000)).toBe("19.9B");
    expect(formatTokens(12)).toBe("12");
  });

  it("formats money, shares, and days", () => {
    expect(formatUsd(1234.5)).toBe("$1,234.50");
    expect(formatShare(0.25)).toBe("25.0%");
    expect(formatShare(0.00001)).toBe("<0.1%");
    expect(formatDayShort("2026-09-28")).toBe("Sep 28");
  });
});
