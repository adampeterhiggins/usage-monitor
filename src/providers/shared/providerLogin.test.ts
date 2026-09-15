import { describe, expect, it } from "vitest";
import { credentialIdentity } from "./providerLogin";

function b64url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function jwt(payload: Record<string, unknown>): string {
  return `${b64url("{}")}.${b64url(JSON.stringify(payload))}.sig`;
}

const FUTURE = Math.floor(Date.now() / 1000) + 3600;

describe("credentialIdentity", () => {
  it("gives two differently-minted Cursor JWTs for one user the same identity", () => {
    const a = `user_1::${jwt({ sub: "google-oauth2|user_1", exp: FUTURE })}`;
    const b = `user_1::${jwt({ sub: "google-oauth2|user_1", exp: FUTURE + 300 })}`;
    expect(credentialIdentity("cursor", a)).toBe(credentialIdentity("cursor", b));
  });

  it("distinguishes different Cursor users", () => {
    expect(credentialIdentity("cursor", "user_1::tok")).not.toBe(
      credentialIdentity("cursor", "user_2::tok"),
    );
  });

  it("prefers a Codex account id over the raw credential", () => {
    expect(credentialIdentity("codex", "blob-a", "acct-1")).toBe(
      credentialIdentity("codex", "blob-b", "acct-1"),
    );
    expect(credentialIdentity("codex", "blob", "acct-1")).not.toBe(
      credentialIdentity("codex", "blob", "acct-2"),
    );
  });

  it("falls back to exact credential equality", () => {
    expect(credentialIdentity("claude", "sk-ant-oat-x")).toBe(
      credentialIdentity("claude", "sk-ant-oat-x"),
    );
    expect(credentialIdentity("devin", "key-a")).not.toBe(credentialIdentity("devin", "key-b"));
  });

  it("is undefined without a credential", () => {
    expect(credentialIdentity("cursor", "  ")).toBeUndefined();
    expect(credentialIdentity("claude", "")).toBeUndefined();
  });
});
