import { describe, expect, it } from "vitest";
import { parseAuthJson, toWindow, windowLabel } from "./usage";

function b64url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function jwt(payload: Record<string, unknown>): string {
  return `${b64url("{}")}.${b64url(JSON.stringify(payload))}.sig`;
}

describe("parseAuthJson", () => {
  it("reads tokens.access_token and the stored account id", () => {
    const creds = parseAuthJson(
      JSON.stringify({ tokens: { access_token: "tok", account_id: "acct_1" } }),
      "Test",
    );
    expect(creds).toEqual({ accessToken: "tok", accountId: "acct_1" });
  });

  it("derives the account id from the access token when absent", () => {
    const token = jwt({ "https://api.openai.com/auth": { chatgpt_account_id: "acct_jwt" } });
    const creds = parseAuthJson(JSON.stringify({ tokens: { access_token: token } }), "Test");
    expect(creds.accountId).toBe("acct_jwt");
  });

  it("rejects invalid JSON and API-key logins with distinct errors", () => {
    expect(() => parseAuthJson("nope", "Test")).toThrow("not valid JSON");
    expect(() => parseAuthJson(JSON.stringify({ OPENAI_API_KEY: "sk-x" }), "Test")).toThrow(
      "API key login",
    );
    expect(() => parseAuthJson(JSON.stringify({ tokens: {} }), "Test")).toThrow(
      "no tokens.access_token",
    );
  });
});

describe("windowLabel", () => {
  it("names windows by duration", () => {
    expect(windowLabel({ limit_window_seconds: 5 * 3600 }, "x")).toBe("5h limit");
    expect(windowLabel({ limit_window_seconds: 24 * 3600 }, "x")).toBe("24h limit");
    expect(windowLabel({ limit_window_seconds: 7 * 24 * 3600 }, "x")).toBe("Weekly limit");
    expect(windowLabel({ limit_window_seconds: 3 * 24 * 3600 }, "x")).toBe("3-day limit");
  });

  it("falls back when the duration is missing", () => {
    expect(windowLabel({}, "Primary")).toBe("Primary");
  });
});

describe("toWindow", () => {
  it("converts seconds to epoch ms and applies the prefix", () => {
    const w = toWindow({ used_percent: 55, reset_at: 1_800_000_000, limit_window_seconds: 5 * 3600 }, "x", "Codex · ");
    expect(w).toEqual({
      label: "Codex · 5h limit",
      usedPercent: 55,
      resetsAt: 1_800_000_000_000,
    });
  });

  it("returns null without a percent", () => {
    expect(toWindow(null, "x")).toBeNull();
    expect(toWindow({ reset_at: 123 }, "x")).toBeNull();
  });
});
