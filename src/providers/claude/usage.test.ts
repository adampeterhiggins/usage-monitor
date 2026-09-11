import { describe, expect, it } from "vitest";
import { parseUsage, type ClaudeUsageResponse } from "./usage";

describe("parseUsage", () => {
  it("maps the well-known buckets to labeled windows", () => {
    const windows = parseUsage({
      five_hour: { utilization: 42, resets_at: "2026-09-10T15:00:00Z" },
      seven_day: { utilization: 10, resets_at: "2026-09-17T00:00:00Z" },
      seven_day_opus: { utilization: 5, resets_at: null },
      seven_day_sonnet: { utilization: 7, resets_at: null },
      seven_day_cowork: null,
    });

    expect(windows.map((w) => w.label)).toEqual([
      "Current session",
      "Weekly · All models",
      "Weekly · Opus",
      "Weekly · Sonnet",
    ]);
    expect(windows[0].usedPercent).toBe(42);
    expect(windows[0].resetsAt).toBe(new Date("2026-09-10T15:00:00Z").getTime());
    expect(windows[2].resetsAt).toBeUndefined();
  });

  it("skips buckets without utilization", () => {
    const windows = parseUsage({ five_hour: { resets_at: "2026-09-10T15:00:00Z" } });
    expect(windows).toEqual([]);
  });

  it("dedupes limits[] entries against the well-known windows", () => {
    const windows = parseUsage({
      five_hour: { utilization: 42, resets_at: null },
      limits: [
        { kind: "session", percent: 99 },
        { kind: "weekly", group: "weekly", percent: 10 },
        { scope: { model: { display_name: "Haiku" } }, percent: 3 },
      ],
    });

    // "Current session" from five_hour wins; the session limit is deduped away.
    expect(windows.map((w) => w.label)).toEqual([
      "Current session",
      "Weekly · All models",
      "Weekly · Haiku",
    ]);
    expect(windows[0].usedPercent).toBe(42);
    expect(windows[1].usedPercent).toBe(10);
  });

  it("labels generic limits by kind", () => {
    const windows = parseUsage({ limits: [{ kind: "monthly_code", percent: 1 }] });
    expect(windows[0].label).toBe("monthly_code");
  });

  it("adds an Extra usage window with a money detail when enabled", () => {
    const windows = parseUsage({
      extra_usage: {
        is_enabled: true,
        monthly_limit: 2000,
        used_credits: 500,
        currency: "usd",
        decimal_places: 2,
      },
    });
    expect(windows).toEqual([
      { label: "Extra usage", usedPercent: 25, detail: "$5.00 of $20.00" },
    ]);
  });

  it("omits Extra usage when disabled or uncapped", () => {
    expect(parseUsage({ extra_usage: { is_enabled: false, monthly_limit: 2000 } })).toEqual([]);
    expect(parseUsage({ extra_usage: { is_enabled: true, monthly_limit: null } })).toEqual([]);
  });

  it("handles an empty response", () => {
    expect(parseUsage({} as ClaudeUsageResponse)).toEqual([]);
  });
});
