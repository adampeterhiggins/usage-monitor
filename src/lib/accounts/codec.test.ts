import { describe, expect, it } from "vitest";

import { toPublic, type Account } from "../contracts/accounts";
import type { AccountAuth } from "../contracts/auth";
import {
  authFromLegacy,
  decodeStoredAccount,
  encodeAccount,
  legacyFieldsFromAuth,
} from "./codec";

describe("authFromLegacy", () => {
  it.each([
    ["claude", "", undefined, { kind: "local-auto" }],
    ["codex", "", undefined, { kind: "local-auto" }],
    ["cursor", "", undefined, { kind: "local-auto" }],
    [
      "claude",
      "",
      "user@work",
      { kind: "local-keychain", keychainAccount: "user@work" },
    ],
    ["cursor", "", "ide", { kind: "cursor-ide" }],
    // `ide` on a non-Cursor account stays a plain Keychain pin — faithful to
    // the old code, which passed `extra` straight to the resolver.
    [
      "claude",
      "",
      "ide",
      { kind: "local-keychain", keychainAccount: "ide" },
    ],
    [
      "codex",
      "raw-access-token",
      "chatgpt-acct-1",
      { kind: "pasted", credential: "raw-access-token", accountId: "chatgpt-acct-1" },
    ],
    [
      "codex",
      '{"tokens":{"access_token":"x","account_id":"a1"}}',
      "a1",
      {
        kind: "session",
        credential: '{"tokens":{"access_token":"x","account_id":"a1"}}',
        accountId: "a1",
      },
    ],
    [
      "claude",
      "sk-ant-oat01-abcdef",
      undefined,
      { kind: "session", credential: "sk-ant-oat01-abcdef", accountId: undefined },
    ],
    [
      "claude",
      "sk-ant-sid01-cookie",
      undefined,
      { kind: "pasted", credential: "sk-ant-sid01-cookie", accountId: undefined },
    ],
  ] as const)("provider %s / credential %s → %j", (provider, credential, extra, expected) => {
    expect(authFromLegacy(provider, credential, extra)).toEqual(expected);
  });

  it("preserves unknown credential text verbatim", () => {
    const auth = authFromLegacy("claude", "totally-bespoke", undefined);
    expect(auth.kind).toBe("pasted");
    expect(auth.kind === "pasted" && auth.credential).toBe("totally-bespoke");
  });
});

describe("legacyFieldsFromAuth", () => {
  it.each([
    [{ kind: "local-auto" }, { credential: "", extra: undefined }],
    [
      { kind: "local-keychain", keychainAccount: "user@work" },
      { credential: "", extra: "user@work" },
    ],
    [{ kind: "cursor-ide" }, { credential: "", extra: "ide" }],
    [
      { kind: "session", credential: "oauth-json", accountId: "acct" },
      { credential: "oauth-json", extra: "acct" },
    ],
    [
      { kind: "pasted", credential: "tok" },
      { credential: "tok", extra: undefined },
    ],
  ] as const)("%j → %j", (auth: AccountAuth, expected) => {
    expect(legacyFieldsFromAuth(auth)).toEqual(expected);
  });
});

describe("decode/encode round-trip", () => {
  const rows = [
    { id: "a1", provider: "claude", label: "CLI", credential: "", hidden: false },
    {
      id: "a2",
      provider: "cursor",
      label: "IDE",
      credential: "",
      extra: "ide",
      hidden: true,
    },
    {
      id: "a3",
      provider: "codex",
      label: "Pasted token",
      credential: "raw-access-token",
      extra: "acct-9",
      hidden: false,
    },
    {
      id: "a4",
      provider: "claude",
      label: "OAuth",
      credential: '{"claudeAiOauth":{"accessToken":"sk-ant-oat01-x"}}',
      hidden: false,
    },
  ] as const;

  it("decodes every supported row shape", () => {
    for (const row of rows) {
      const account = decodeStoredAccount(row);
      expect(account).not.toBeNull();
      expect(account!.id).toBe(row.id);
      expect(account!.hidden).toBe(row.hidden);
    }
  });

  it("re-encodes to the same stored shape", () => {
    for (const row of rows) {
      const account = decodeStoredAccount(row)!;
      expect(encodeAccount(account)).toEqual(row);
    }
  });

  it("drops malformed rows without throwing", () => {
    expect(decodeStoredAccount(null)).toBeNull();
    expect(decodeStoredAccount({})).toBeNull();
    expect(decodeStoredAccount({ id: "x", label: "x", provider: "openai" })).toBeNull();
    expect(decodeStoredAccount([1, 2])).toBeNull();
  });
});

describe("toPublic", () => {
  const account: Account = {
    id: "a1",
    provider: "codex",
    label: "Work",
    auth: { kind: "pasted", credential: "  secret-token  ", accountId: "acct-1" },
    hidden: true,
  };

  it("exposes the auth kind and credential presence, never the material", () => {
    const pub = toPublic(account);
    expect(pub).toEqual({
      id: "a1",
      provider: "codex",
      label: "Work",
      authKind: "pasted",
      hasCredential: true,
      hidden: true,
    });
    expect("credential" in pub).toBe(false);
    expect("extra" in pub).toBe(false);
    expect("accountId" in pub).toBe(false);
  });

  it("treats local auth as credential-free", () => {
    expect(toPublic({ ...account, auth: { kind: "local-auto" } }).hasCredential).toBe(false);
    expect(
      toPublic({
        ...account,
        auth: { kind: "session", credential: "   " },
      }).hasCredential,
    ).toBe(false);
  });
});
