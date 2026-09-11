import { describe, expect, it } from "vitest";

import { themeColorToHex } from "./colors";
import {
  parseThemeFile,
  serializeThemeFile,
  serializeThemeRecord,
  THEME_FILE_VERSION,
} from "./theme-file";
import type { ThemeDefinition } from "./source-types";

const SPEC = { seeds: { canvas: "#111113", accent: "#66ccff" } };

describe("parseThemeFile", () => {
  it("parses seeds + overrides into a mode spec", () => {
    const theme = parseThemeFile({
      version: THEME_FILE_VERSION,
      name: "New File",
      appearance: "dark",
      seeds: SPEC.seeds,
      overrides: { cardBackground: "#18181c", focusRing: "#ffcc00" },
    });
    const spec = theme.modes.dark;
    expect(theme.appearance).toBe("dark");
    expect(themeColorToHex(spec!.seeds.canvas)).toBe("#111113");
    expect(themeColorToHex(spec!.seeds.accent)).toBe("#66ccff");
    expect(themeColorToHex(spec!.overrides!.cardBackground!)).toBe("#18181c");
    expect(themeColorToHex(spec!.overrides!.focusRing!)).toBe("#ffcc00");
  });

  it("parses variants into per-mode specs", () => {
    const theme = parseThemeFile({
      version: THEME_FILE_VERSION,
      name: "Pair",
      appearance: "light",
      seeds: { canvas: "#ffffff", accent: "#138af2" },
      variants: {
        dark: { seeds: { canvas: "#101012", accent: "#5aa0f0" } },
      },
    });
    expect(themeColorToHex(theme.modes.dark!.seeds.canvas)).toBe("#101012");
  });

  it("rejects unknown override roles and malformed colors", () => {
    expect(() =>
      parseThemeFile({
        version: THEME_FILE_VERSION,
        name: "Bad role",
        appearance: "light",
        seeds: SPEC.seeds,
        overrides: { mysteryKey: "#123456" },
      }),
    ).toThrow(/override role/);
    expect(() =>
      parseThemeFile({
        version: THEME_FILE_VERSION,
        name: "Bad color",
        appearance: "light",
        seeds: { canvas: 42, accent: "#ffffff" },
      }),
    ).toThrow(/literal CSS color/);
  });

  it("rejects unsupported versions — including old v1 files", () => {
    expect(() =>
      parseThemeFile({ version: 1, name: "x", appearance: "light", colors: { canvas: "#fff" } }),
    ).toThrow(/unsupported/i);
    expect(() => parseThemeFile({ version: 99, name: "x", appearance: "light" })).toThrow(
      /unsupported/i,
    );
    expect(() => parseThemeFile("string")).toThrow();
  });

  it("preserves a supplied id and collection", () => {
    const theme = parseThemeFile({
      version: THEME_FILE_VERSION,
      id: "kept-id",
      name: "Collected",
      appearance: "light",
      seeds: SPEC.seeds,
      collection: { id: "pack:1", label: "Pack One" },
    });
    expect(theme.id).toBe("kept-id");
    expect(theme.collection?.id).toBe("pack:1");
  });
});

describe("serializeThemeRecord", () => {
  it("writes the current file shape with seeds + finite overrides", () => {
    const theme: ThemeDefinition = parseThemeFile({
      version: THEME_FILE_VERSION,
      name: "App Theme",
      appearance: "dark",
      seeds: { canvas: "#141416", accent: "#aa88ff" },
      overrides: { textSecondary: "#a0a0a5" },
    });
    const record = serializeThemeRecord(theme);
    expect(record.version).toBe(THEME_FILE_VERSION);
    const seeds = record.seeds as Record<string, string>;
    expect(themeColorToHex(seeds.canvas!)).toBe("#141416");
    expect(themeColorToHex(seeds.accent!)).toBe("#aa88ff");
    const overrides = record.overrides as Record<string, string>;
    expect(themeColorToHex(overrides.textSecondary!)).toBe("#a0a0a5");
    expect(() => parseThemeFile(record)).not.toThrow();
  });

  it("serializeThemeFile produces parseable JSON", () => {
    const theme = parseThemeFile({
      version: THEME_FILE_VERSION,
      name: "Roundtrip",
      appearance: "light",
      seeds: { canvas: "#fefefe", accent: "#0055cc" },
    });
    const reparsed = parseThemeFile(JSON.parse(serializeThemeFile(theme)));
    expect(reparsed.label).toBe("Roundtrip");
    expect(reparsed.appearance).toBe("light");
  });
});
