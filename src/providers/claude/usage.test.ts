import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Account } from "../../contracts/accounts";
import { fetchJson, HttpError } from "../../platform/http";
import { refreshClaudeOauth } from "./auth";
import { fetchClaudeUsage, parseUsage, type ClaudeUsageResponse } from "./usage";

vi.mock("../../platform/http", async (importActual) => ({
  ...(await importActual<typeof import("../../platform/http")>()),
  fetchJson: vi.fn(),
}));
vi.mock("./auth", async (importActual) => ({
  ...(await importActual<typeof import("./auth")>()),
  refreshClaudeOauth: vi.fn(),
}));

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

describe("fetchClaudeUsage with a saved login", () => {
  const account = (tokens: object): Account => ({
    id: "a1",
    provider: "claude",
    label: "Claude",
    auth: { kind: "session", credential: JSON.stringify({ claudeAiOauth: tokens }) },
  }) as unknown as Account;
  const live = { accessToken: "old", refreshToken: "r1", expiresAt: Date.now() + 3_600_000 };

  beforeEach(() => {
    vi.mocked(fetchJson).mockReset();
    vi.mocked(refreshClaudeOauth).mockReset();
  });

  it("refreshes the token and retries once when usage answers 429", async () => {
    vi.mocked(fetchJson).mockImplementation(async (_url, init) => {
      if (init?.headers?.Authorization === "Bearer old") throw new HttpError("HTTP 429", 429);
      return { five_hour: { utilization: 3 } };
    });
    vi.mocked(refreshClaudeOauth).mockResolvedValue({ accessToken: "new", refreshToken: "r2" });
    const persistCredential = vi.fn();

    const snapshot = await fetchClaudeUsage(account(live), { persistCredential });

    expect(snapshot.windows[0]).toMatchObject({ label: "Current session", usedPercent: 3 });
    expect(refreshClaudeOauth).toHaveBeenCalledTimes(1);
    expect(JSON.parse(persistCredential.mock.calls[0][0]).claudeAiOauth.accessToken).toBe("new");
  });

  it("keeps the 429 when the refresh fails", async () => {
    vi.mocked(fetchJson).mockRejectedValue(new HttpError("HTTP 429", 429));
    vi.mocked(refreshClaudeOauth).mockRejectedValue(new Error("nope"));

    await expect(fetchClaudeUsage(account(live))).rejects.toMatchObject({ status: 429 });
  });

  it("does not refresh on other errors", async () => {
    vi.mocked(fetchJson).mockRejectedValue(new HttpError("HTTP 500", 500));

    await expect(fetchClaudeUsage(account(live))).rejects.toMatchObject({ status: 500 });
    expect(refreshClaudeOauth).not.toHaveBeenCalled();
  });
});
