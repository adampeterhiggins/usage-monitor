import { describe, expect, it } from "vitest";
import { mockJwt } from "../../testing/fixtures";
import { grokCredential, grokTokenExpired, parseGrokAuthJson } from "./auth";
import { snapshotFromBilling } from "./usage";

const GROK_COM = "https://auth.x.ai::b1a00492-073a-47ea-816f-4c329264a828";

describe("snapshotFromBilling", () => {
  it("maps a metered weekly period", () => {
    const snapshot = snapshotFromBilling({
      config: {
        creditUsagePercent: 37.5,
        currentPeriod: { type: "USAGE_PERIOD_TYPE_WEEKLY", end: "2026-10-10T00:00:00+00:00" },
      },
    });
    expect(snapshot.windows).toEqual([
      { label: "Weekly", usedPercent: 37.5, resetsAt: Date.parse("2026-10-10T00:00:00Z") },
    ]);
  });

  it("reads an omitted percent in a live period as untouched, not unknown", () => {
    // Shaped after a real reply: xAI leaves the percent out until usage registers.
    const snapshot = snapshotFromBilling({
      config: {
        currentPeriod: {
          type: "USAGE_PERIOD_TYPE_WEEKLY",
          start: "2026-10-03T00:00:00+00:00",
          end: "2026-10-10T00:00:00+00:00",
        },
        onDemandCap: { val: 0 },
        onDemandUsed: { val: 0 },
      },
    });
    expect(snapshot.windows).toEqual([
      { label: "Weekly", usedPercent: 0, resetsAt: Date.parse("2026-10-10T00:00:00Z") },
    ]);
  });

  it("labels monthly and unknown periods and clamps the percent", () => {
    expect(
      snapshotFromBilling({ config: { creditUsagePercent: 140, currentPeriod: { type: "USAGE_PERIOD_TYPE_MONTHLY" } } })
        .windows[0],
    ).toEqual({ label: "Monthly", usedPercent: 100, resetsAt: undefined });
    expect(snapshotFromBilling({ config: { creditUsagePercent: 5 } }).windows[0].label).toBe("Subscription");
  });

  it("adds on-demand spend as a ratio of its cap", () => {
    const snapshot = snapshotFromBilling({
      config: { creditUsagePercent: 100, onDemandCap: { val: 2000 }, onDemandUsed: { val: 500 } },
    });
    expect(snapshot.windows[1]).toEqual({ label: "On-demand", usedPercent: 25 });
  });

  it("says so when nothing is reported", () => {
    expect(snapshotFromBilling({}).windows).toEqual([{ label: "Usage", detail: "No quota data reported" }]);
  });
});

describe("Grok credentials", () => {
  it("reads the grok.com login from auth.json", () => {
    const raw = JSON.stringify({ [GROK_COM]: { key: "tok", auth_mode: "oidc", email: "a@b.c" } });
    expect(parseGrokAuthJson(raw, "auth.json")).toEqual({ token: "tok", email: "a@b.c" });
  });

  it("ignores other deployments in the same file", () => {
    const raw = JSON.stringify({ "https://auth.example.com::other": { key: "tok" } });
    expect(() => parseGrokAuthJson(raw, "auth.json")).toThrow(/no grok.com login/);
  });

  it("rejects an API-key login, which has no subscription quota", () => {
    const raw = JSON.stringify({ [GROK_COM]: { key: "xai-123", auth_mode: "api_key" } });
    expect(() => parseGrokAuthJson(raw, "auth.json")).toThrow(/API key/);
  });

  it("accepts a bare token or the whole file", () => {
    expect(grokCredential("  tok  ", "Pasted").token).toBe("tok");
    expect(grokCredential(JSON.stringify({ [GROK_COM]: { key: "tok2" } }), "Pasted").token).toBe("tok2");
    expect(() => grokCredential("not a token", "Pasted")).toThrow(/not a Grok access token/);
  });

  it("reads expiry from the token's exp claim", () => {
    const now = 1_800_000_000_000;
    expect(grokTokenExpired(mockJwt({ exp: now / 1000 - 1 }), now)).toBe(true);
    expect(grokTokenExpired(mockJwt({ exp: now / 1000 + 60 }), now)).toBe(false);
    expect(grokTokenExpired("opaque", now)).toBe(false);
  });
});
