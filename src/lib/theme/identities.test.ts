import { describe, expect, it } from "vitest";

import {
  DEFAULT_FORM_TOKENS,
  FORM_TOKENS,
  FORM_TOKEN_VARIABLES,
  formTokensToCssVariables,
  formVar,
} from "./form-tokens";
import {
  DEFAULT_IDENTITY,
  IDENTITIES,
  IDENTITY_IDS,
  IDENTITY_LIST,
  getIdentity,
  isIdentityId,
  resolveFormTokens,
} from "./identities";
import {
  DEFAULT_APPEARANCE_SETTINGS,
  appearanceSettingsEqual,
  normalizeAppearanceSettings,
} from "./appearance";

describe("form token contract", () => {
  it("emits every manifest variable", () => {
    const vars = formTokensToCssVariables(DEFAULT_FORM_TOKENS);
    expect(Object.keys(vars).sort()).toEqual([...FORM_TOKEN_VARIABLES].sort());
    for (const name of FORM_TOKEN_VARIABLES) expect(vars[name]).toBeTruthy();
  });

  it("namespaces variables under --form-", () => {
    for (const token of FORM_TOKENS) expect(formVar(token)).toBe(`--form-${token}`);
  });
});

describe("identities", () => {
  it("defaults to Standard, which changes nothing", () => {
    expect(DEFAULT_IDENTITY).toBe("standard");
    expect(IDENTITIES.standard.tokens).toEqual({});
    expect(resolveFormTokens("standard")).toEqual(DEFAULT_FORM_TOKENS);
  });

  it("resolves every identity to a complete token set", () => {
    for (const id of IDENTITY_IDS) {
      const resolved = resolveFormTokens(id);
      for (const token of FORM_TOKENS) {
        expect(resolved[token], `${id}.${token}`).toBeTypeOf("string");
        expect(resolved[token], `${id}.${token}`).not.toBe("");
      }
    }
  });

  it("only overrides tokens that exist in the manifest", () => {
    for (const identity of IDENTITY_LIST) {
      for (const token of Object.keys(identity.tokens)) {
        expect(FORM_TOKENS, `${identity.id} declares unknown token ${token}`).toContain(token);
      }
    }
  });

  it("falls back to Standard for an unknown identity", () => {
    expect(isIdentityId("nope")).toBe(false);
    expect(getIdentity("nope").id).toBe(DEFAULT_IDENTITY);
    expect(resolveFormTokens(undefined)).toEqual(DEFAULT_FORM_TOKENS);
  });

  it("gives Dial an arc and every other identity a bar", () => {
    for (const id of IDENTITY_IDS) {
      const { "meter-bar-display": bar, "meter-ring-display": ring } = resolveFormTokens(id);
      // Exactly one meter is ever visible, so the two can share markup.
      expect([bar, ring].filter((value) => value !== "none")).toHaveLength(1);
    }
    expect(resolveFormTokens("dial")["meter-ring-display"]).toBe("block");
  });

  it("lets an explicit interface font beat the identity's family", () => {
    expect(resolveFormTokens("mono")["font-family"]).toBe("var(--font-mono)");
    expect(resolveFormTokens("mono", { customSansFontStack: "Inter" })["font-family"]).toBe(
      "var(--font-sans)",
    );
    // Blank means "no explicit choice" — the identity keeps its family.
    expect(resolveFormTokens("mono", { customSansFontStack: "  " })["font-family"]).toBe(
      "var(--font-mono)",
    );
  });

  it("expresses 'no tint' as a guaranteed-invalid value so var() falls back", () => {
    expect(resolveFormTokens("standard")["card-tint-orange"]).toBe("initial");
    expect(resolveFormTokens("tint")["card-tint-orange"]).toBe(
      "var(--ui-card-provider-orange-background)",
    );
  });
});

describe("identity in appearance settings", () => {
  it("defaults to Standard and survives settings written before the axis existed", () => {
    expect(DEFAULT_APPEARANCE_SETTINGS.identity).toBe(DEFAULT_IDENTITY);
    expect(normalizeAppearanceSettings({ glassOpacity: 55 }).identity).toBe(DEFAULT_IDENTITY);
  });

  it("rejects an identity that no longer exists", () => {
    expect(
      normalizeAppearanceSettings({ identity: "retired" as never }).identity,
    ).toBe(DEFAULT_IDENTITY);
  });

  it("counts towards preset equality", () => {
    expect(
      appearanceSettingsEqual(DEFAULT_APPEARANCE_SETTINGS, {
        ...DEFAULT_APPEARANCE_SETTINGS,
        identity: "mono",
      }),
    ).toBe(false);
  });
});
