import { describe, expect, it } from "vitest";

import { parseStoredHalves, parseThemeHalves, resolveThemeHalf } from "./halves";

describe("parseThemeHalves", () => {
  it("parses a JSON record of renderable halves", () => {
    // t3-chat is light-based with a dark variant, so it can render either half.
    expect(parseThemeHalves('{"light":"t3-chat","dark":"t3-chat"}')).toEqual({
      light: "t3-chat",
      dark: "t3-chat",
    });
  });

  it("returns null for empty, invalid, or unrenderable values", () => {
    expect(parseThemeHalves(null)).toBeNull();
    expect(parseThemeHalves("")).toBeNull();
    expect(parseThemeHalves("not json")).toBeNull();
    expect(parseThemeHalves('{"light":"nope","dark":"nope"}')).toBeNull();
    expect(parseThemeHalves('{"light":42}')).toBeNull();
  });

  it("drops halves a theme cannot render", () => {
    // An unknown id is dropped, but a valid half survives.
    expect(parseThemeHalves('{"light":"missing-theme","dark":"grove"}')).toEqual({
      dark: "grove",
    });
  });
});

describe("parseStoredHalves", () => {
  it("accepts a stored JSON string", () => {
    expect(parseStoredHalves('{"light":"ocean","dark":"ember"}')).toEqual({
      light: "ocean",
      dark: "ember",
    });
  });

  it("accepts a plain stored record", () => {
    expect(parseStoredHalves({ light: "ocean", dark: "ember" })).toEqual({
      light: "ocean",
      dark: "ember",
    });
  });

  it("returns null for shapes that are not a halves record", () => {
    expect(parseStoredHalves(undefined)).toBeNull();
    expect(parseStoredHalves(42)).toBeNull();
    expect(parseStoredHalves(["ocean"])).toBeNull();
  });
});

describe("resolveThemeHalf", () => {
  it("prefers the configured half and falls back to the base theme", () => {
    const halves = { light: "ocean", dark: "ember" };
    expect(resolveThemeHalf("t3-chat", halves, "dark")).toBe("ember");
    expect(resolveThemeHalf("t3-chat", null, "light")).toBe("t3-chat");
  });
});
