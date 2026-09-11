import { describe, expect, it } from "vitest";
import { describeKeychainEntry, keychainStampToMs } from "./localCredentials";

describe("keychainStampToMs", () => {
  it("parses YYYYMMDDHHMMSSZ stamps", () => {
    expect(keychainStampToMs("20260909084709Z")).toBe(Date.UTC(2026, 8, 9, 8, 47, 9));
  });

  it("rejects malformed stamps", () => {
    expect(keychainStampToMs("2026-09-09")).toBeUndefined();
    expect(keychainStampToMs("")).toBeUndefined();
    expect(keychainStampToMs(undefined)).toBeUndefined();
    expect(keychainStampToMs(null)).toBeUndefined();
  });
});

describe("describeKeychainEntry", () => {
  it("falls back to the bare account without a stamp", () => {
    expect(describeKeychainEntry({ account: "me@example.com" })).toBe("me@example.com");
  });

  it("appends the update time when a stamp is present", () => {
    const text = describeKeychainEntry({ account: "me@example.com", modified: "20260909084709Z" });
    expect(text).toContain("me@example.com");
    expect(text).toContain("updated");
  });
});
