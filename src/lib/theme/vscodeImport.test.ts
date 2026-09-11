import { describe, expect, it } from "vitest";

import {
  humanizeThemeName,
  isVsCodeThemeFile,
  pairVsCodeThemes,
  parseVsCodeThemeFile,
} from "./vscodeImport";
import { themeColorToHex } from "./colors";

describe("isVsCodeThemeFile", () => {
  it("recognizes workbench colors by dotted keys", () => {
    expect(isVsCodeThemeFile({ colors: { "editor.background": "#fff" } })).toBe(true);
    expect(isVsCodeThemeFile({ colors: { canvas: "#fff" } })).toBe(false);
    expect(isVsCodeThemeFile({ version: 2, name: "x", appearance: "light" })).toBe(false);
  });
});

describe("parseVsCodeThemeFile", () => {
  it("produces an app spec seeded from editor.background + focusBorder", () => {
    const theme = parseVsCodeThemeFile({
      name: "pack.theme-name",
      colors: {
        "editor.background": "#1e1e2e",
        focusBorder: "#cba6f7",
      },
      type: "dark",
    });
    expect(theme.appearance).toBe("dark");
    const spec = theme.modes.dark;
    expect(themeColorToHex(spec!.seeds.canvas)).toBe("#1e1e2e");
    expect(themeColorToHex(spec!.seeds.accent)).toBe("#cba6f7");
    expect(theme.label).toBe("Pack Theme Name");
  });

  it("infers dark from canvas luminance when type is absent", () => {
    const theme = parseVsCodeThemeFile({
      name: "Luma",
      colors: { "editor.background": "#101010" },
    });
    expect(theme.appearance).toBe("dark");
  });

  it("accepts #RGBA and #RRGGBBAA and flattens them over the canvas", () => {
    const theme = parseVsCodeThemeFile({
      name: "Alpha",
      type: "light",
      colors: {
        "editor.background": "#ffffff",
        "editorWidget.background": "#00000080", // ~50% black → #7f7f7f
        "input.background": "#0008",
      },
    });
    const spec = theme.modes.light;
    expect(themeColorToHex(spec!.overrides!.cardBackground!)).toBe("#7f7f7f");
    // #0008 → alpha nibble doubles to 0x88 (~53%) → #777777 over white
    expect(themeColorToHex(spec!.overrides!.inputBackground!)).toBe("#777777");
  });

  it("converts color(display-p3) and color(srgb) values", () => {
    const theme = parseVsCodeThemeFile({
      name: "Wide",
      type: "dark",
      colors: {
        "editor.background": "color(display-p3 0.1 0.1 0.12)",
        focusBorder: "color(srgb 0.4 0.6 1 / 0.5)",
      },
    });
    const spec = theme.modes.dark;
    expect(themeColorToHex(spec!.seeds.canvas)).toMatch(/^#[0-9a-f]{6}$/);
    // accent flattened over the canvas — still a readable hex
    expect(themeColorToHex(spec!.seeds.accent)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("leaves roles it cannot safely map to the resolver", () => {
    const theme = parseVsCodeThemeFile({
      name: "Sparse",
      type: "dark",
      colors: { "editor.background": "#202020" },
    });
    const spec = theme.modes.dark;
    // No workbench text colors → no text overrides; the resolver derives them.
    expect(spec!.overrides?.textPrimary).toBeUndefined();
    expect(spec!.overrides?.cardBackground).toBeUndefined();
  });

  it("drops an unreadable imported foreground rather than keeping it", () => {
    const theme = parseVsCodeThemeFile({
      name: "Unreadable",
      type: "light",
      colors: {
        "editor.background": "#ffffff",
        "editor.foreground": "#f0f0f0", // ~1.2:1 on white — must not be adopted
      },
    });
    expect(theme.modes.light!.overrides?.textPrimary).toBeUndefined();
  });

  it("rejects files without an editor background", () => {
    expect(() => parseVsCodeThemeFile({ colors: { "panel.background": "#111" } })).toThrow(
      /editor\.background/,
    );
  });
});

describe("pairVsCodeThemes", () => {
  it("pairs light + dark files of the same family into one dual-mode theme", () => {
    const light = parseVsCodeThemeFile({
      name: "Meadow Light",
      type: "light",
      colors: { "editor.background": "#f6f6f6" },
    });
    const dark = parseVsCodeThemeFile({
      name: "Meadow Dark",
      type: "dark",
      colors: { "editor.background": "#161616" },
    });
    const paired = pairVsCodeThemes([light, dark]);
    expect(paired).toHaveLength(1);
    expect(paired[0]!.label).toBe("Meadow");
    expect(paired[0]!.modes.light).toBeDefined();
    expect(paired[0]!.modes.dark).toBeDefined();
  });

  it("does not pair into a reserved built-in id", () => {
    // "Grove" is a stock theme; a family that strips down to it must stay split.
    const light = parseVsCodeThemeFile({
      name: "Grove Light",
      type: "light",
      colors: { "editor.background": "#f6f6f6" },
    });
    const dark = parseVsCodeThemeFile({
      name: "Grove Dark",
      type: "dark",
      colors: { "editor.background": "#161616" },
    });
    expect(pairVsCodeThemes([light, dark])).toHaveLength(2);
  });

  it("leaves single-appearance themes alone", () => {
    const only = parseVsCodeThemeFile({
      name: "Solo Dark",
      type: "dark",
      colors: { "editor.background": "#101010" },
    });
    expect(pairVsCodeThemes([only])).toHaveLength(1);
    expect(pairVsCodeThemes([only])[0]!.label).toBe("Solo Dark");
  });
});

describe("humanizeThemeName", () => {
  it("expands package slugs and leaves display names alone", () => {
    expect(humanizeThemeName("one-dark-pro")).toBe("One Dark Pro");
    expect(humanizeThemeName("GitHub Dark")).toBe("GitHub Dark");
    expect(humanizeThemeName("catppuccin_mocha")).toBe("Catppuccin Mocha");
  });
});

describe("themeColorToHex on imported hex", () => {
  it("canonicalizes 3- and 8-digit forms the importer relies on", () => {
    expect(themeColorToHex("#fff")).toBe("#ffffff");
    expect(themeColorToHex("#11223344")).toMatch(/^#112233/);
  });
});
