import { describe, expect, it } from "vitest";
import {
  base64Url,
  decodeJwtPayload,
  describeLoginError,
  isAbortError,
  oauthErrorMessage,
  pkceChallenge,
} from "./login-session";

function b64url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function jwt(payload: Record<string, unknown>): string {
  return `${b64url(JSON.stringify({ alg: "none" }))}.${b64url(JSON.stringify(payload))}.sig`;
}

describe("base64Url", () => {
  it("uses the URL-safe alphabet without padding", () => {
    // 0xFB 0xFF 0xBE encodes as "+/++" in standard base64.
    expect(base64Url(new Uint8Array([0xfb, 0xff, 0xbe]))).toBe("-_--");
    expect(base64Url(new Uint8Array([1, 2, 3]))).toBe("AQID");
  });
});

describe("pkceChallenge", () => {
  it("matches the RFC 7636 test vector", () => {
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });
});

describe("decodeJwtPayload", () => {
  it("decodes a well-formed token", () => {
    expect(decodeJwtPayload(jwt({ sub: "user_1" }))).toEqual({ sub: "user_1" });
  });

  it("returns null for malformed input", () => {
    expect(decodeJwtPayload("not-a-jwt")).toBeNull();
    expect(decodeJwtPayload("a.!!!.c")).toBeNull();
  });
});

describe("oauthErrorMessage", () => {
  it("prefers error_description, then string error, then nested error, then message", () => {
    expect(oauthErrorMessage({ error_description: "nope", error: "x" }, "fb")).toBe("nope");
    expect(oauthErrorMessage({ error: "access_denied" }, "fb")).toBe("access_denied");
    expect(oauthErrorMessage({ error: { message: "nested" } }, "fb")).toBe("nested");
    expect(oauthErrorMessage({ error: { type: "auth_error" } }, "fb")).toBe("auth_error");
    expect(oauthErrorMessage({ message: "plain" }, "fb")).toBe("plain");
    expect(oauthErrorMessage({}, "fb")).toBe("fb");
    expect(oauthErrorMessage(null, "fb")).toBe("fb");
  });
});

describe("describeLoginError / isAbortError", () => {
  it("translates aborts into a cancellation message", () => {
    const err = new DOMException("The operation was aborted.", "AbortError");
    expect(isAbortError(err)).toBe(true);
    expect(describeLoginError(err, "fb")).toBe("Sign-in cancelled.");
  });

  it("passes through error messages and the fallback", () => {
    expect(describeLoginError(new Error("boom"), "fb")).toBe("boom");
    expect(describeLoginError("weird", "fb")).toBe("fb");
    expect(isAbortError(new Error("AbortError"))).toBe(false);
  });
});
