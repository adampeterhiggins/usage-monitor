import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatFetchedAt,
  formatPercent,
  formatReset,
  severity,
  shortLabel,
  toPublic,
  worstPercent,
  type Account,
} from "./usage-types";

afterEach(() => {
  vi.useRealTimers();
});

describe("severity", () => {
  it("maps percentages to severity bands", () => {
    expect(severity(undefined)).toBe("neutral");
    expect(severity(0)).toBe("ok");
    expect(severity(39.9)).toBe("ok");
    expect(severity(40)).toBe("warn");
    expect(severity(70)).toBe("high");
    expect(severity(90)).toBe("critical");
    expect(severity(100)).toBe("critical");
  });
});

describe("formatPercent", () => {
  it("renders a dash for missing values", () => {
    expect(formatPercent(undefined)).toBe("—");
  });

  it("rounds to one decimal and drops it for integers", () => {
    expect(formatPercent(50)).toBe("50%");
    expect(formatPercent(12.34)).toBe("12.3%");
    expect(formatPercent(99.96)).toBe("100%");
  });
});

describe("shortLabel", () => {
  it("maps well-known window labels to short forms", () => {
    expect(shortLabel("Current session")).toBe("5h");
    expect(shortLabel("Weekly · All models")).toBe("Wk");
    expect(shortLabel("Weekly · Opus")).toBe("Opus");
    expect(shortLabel("Cursor Models")).toBe("Cursor");
    expect(shortLabel("Other Models")).toBe("API");
    expect(shortLabel("On-demand spend")).toBe("On-demand");
  });

  it("truncates long unknown labels", () => {
    expect(shortLabel("a very long window label")).toBe("a very long w…");
    expect(shortLabel("Short")).toBe("Short");
  });
});

describe("formatReset", () => {
  it("describes minutes, hours, and days until reset", () => {
    const now = new Date("2026-09-10T12:00:00Z").getTime();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    expect(formatReset(now + 30 * 60_000)).toBe("resets in 30 min");
    expect(formatReset(now + 90 * 60_000)).toBe("resets in 1 hr 30 min");
    expect(formatReset(now + (3 * 24 + 2) * 3_600_000)).toBe("resets in 3 d 2 hr");
    expect(formatReset(now - 1)).toBe("resetting…");
    expect(formatReset(undefined)).toBeUndefined();
  });
});

describe("formatFetchedAt", () => {
  it("describes freshness", () => {
    const now = new Date("2026-09-10T12:00:00Z").getTime();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    expect(formatFetchedAt(now - 10_000)).toBe("just now");
    expect(formatFetchedAt(now - 5 * 60_000)).toBe("5 min ago");
    expect(formatFetchedAt(now - 3 * 3_600_000)).toMatch(/\d{2}:\d{2}/);
  });
});

describe("worstPercent", () => {
  it("returns the max used percent, ignoring missing values", () => {
    expect(worstPercent([])).toBeUndefined();
    expect(
      worstPercent([{ label: "a" }, { label: "b", usedPercent: 42 }, { label: "c", usedPercent: 7 }]),
    ).toBe(42);
  });
});

describe("toPublic", () => {
  const account: Account = {
    id: "a1",
    provider: "claude",
    label: "Work",
    credential: "  secret  ",
    extra: "pin",
    hidden: true,
  };

  it("strips the credential but reports whether one exists", () => {
    const pub = toPublic(account);
    expect(pub).toEqual({
      id: "a1",
      provider: "claude",
      label: "Work",
      hasCredential: true,
      extra: "pin",
      hidden: true,
    });
    expect("credential" in pub).toBe(false);
  });

  it("treats whitespace-only credentials as absent", () => {
    expect(toPublic({ ...account, credential: "   " }).hasCredential).toBe(false);
  });
});
