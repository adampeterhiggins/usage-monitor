import { describe, expect, it } from "vitest";
import { cookieFromPasted, findGrokBotUsage, sessionCookieFromJwt } from "./usage";

function b64url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function jwt(payload: Record<string, unknown>): string {
  return `${b64url("{}")}.${b64url(JSON.stringify(payload))}.sig`;
}

const FUTURE = Math.floor(Date.now() / 1000) + 3600;

describe("sessionCookieFromJwt", () => {
  it("builds userId::jwt, stripping the auth0 connection prefix", () => {
    const token = jwt({ sub: "auth0|user_123", exp: FUTURE });
    expect(sessionCookieFromJwt(token, "T")).toBe(`user_123::${token}`);
  });

  it("accepts a bare sub and a JSON-wrapped accessToken", () => {
    const token = jwt({ sub: "user_9", exp: FUTURE });
    expect(sessionCookieFromJwt(token, "T")).toBe(`user_9::${token}`);
    expect(sessionCookieFromJwt(JSON.stringify({ accessToken: token }), "T")).toBe(
      `user_9::${token}`,
    );
  });

  it("rejects expired, subject-less, and API-key tokens", () => {
    expect(() =>
      sessionCookieFromJwt(jwt({ sub: "u", exp: 1_000_000 }), "T"),
    ).toThrow("expired");
    expect(() => sessionCookieFromJwt(jwt({ exp: FUTURE }), "T")).toThrow("subject claim");
    expect(() =>
      sessionCookieFromJwt(jwt({ sub: "u", type: "api_key", exp: FUTURE }), "T"),
    ).toThrow("API key login");
    expect(() => sessionCookieFromJwt("not-a-jwt", "T")).toThrow("not a Cursor session token");
  });
});

describe("cookieFromPasted", () => {
  it("strips the cookie name and passes userId::jwt through", () => {
    expect(cookieFromPasted("WorkosCursorSessionToken=u%3A%3Ajwt")).toBe("u%3A%3Ajwt");
    expect(cookieFromPasted("user::token")).toBe("user::token");
  });

  it("converts a pasted raw JWT into cookie form", () => {
    const token = jwt({ sub: "auth0|user_1", exp: FUTURE });
    expect(cookieFromPasted(token)).toBe(`user_1::${token}`);
  });
});

describe("findGrokBotUsage", () => {
  it("finds a metric under a Grok/Bot-ish key at any depth", () => {
    const data = {
      individualUsage: {
        grokBot: { usedPercent: 61, resetsAt: "2026-09-17T00:00:00Z" },
      },
    };
    expect(findGrokBotUsage(data)).toEqual({
      usedPercent: 61,
      resetsAt: new Date("2026-09-17T00:00:00Z").getTime(),
    });
  });

  it("derives percent from used/limit", () => {
    expect(findGrokBotUsage({ bot: { used: 25, limit: 100 } })).toEqual({ usedPercent: 25, resetsAt: undefined });
  });

  it("ignores metrics outside Grok/Bot-ish keys", () => {
    expect(findGrokBotUsage({ weekly: { usedPercent: 80 } })).toBeUndefined();
    expect(findGrokBotUsage({ usage: { percent: 10 } })).toBeUndefined();
  });

  it("walks arrays and nested objects", () => {
    const data = { items: [{ other: 1 }, { grok: { usagePercent: 33 } }] };
    expect(findGrokBotUsage(data)?.usedPercent).toBe(33);
  });

  it("returns undefined for non-objects", () => {
    expect(findGrokBotUsage(null)).toBeUndefined();
    expect(findGrokBotUsage("grok")).toBeUndefined();
    expect(findGrokBotUsage(42)).toBeUndefined();
  });
});
