import { describe, expect, it } from "vitest";

import { applyUiPaletteToElement } from "./preview";
import { resolveUiPalette } from "./resolve-ui-palette";
import { stockModeSpec } from "./stock-source";
import { paletteToCssVariables } from "./ui-palette-css";
import { UI_PALETTE_VARIABLES } from "./ui-tokens";

describe("paletteToCssVariables", () => {
  it("emits every variable in the manifest", () => {
    const palette = resolveUiPalette(stockModeSpec("light"), "light");
    const vars = paletteToCssVariables(palette);
    for (const name of UI_PALETTE_VARIABLES) {
      expect(vars[name], name).toBeDefined();
      expect(String(vars[name]).length, name).toBeGreaterThan(0);
    }
  });

  it("is deterministic for a given source", () => {
    const source = stockModeSpec("dark");
    const first = paletteToCssVariables(resolveUiPalette(source, "dark"));
    const second = paletteToCssVariables(resolveUiPalette(source, "dark"));
    expect(first).toEqual(second);
  });
});

describe("applyUiPaletteToElement", () => {
  it("writes the whole resolved palette onto the element", () => {
    const written = new Map<string, string>();
    const element = {
      style: {
        setProperty: (name: string, value: string) => written.set(name, value),
        removeProperty: (name: string) => written.delete(name),
      },
    } as unknown as HTMLElement;

    applyUiPaletteToElement(element, resolveUiPalette(stockModeSpec("light"), "light"));
    expect(written.size).toBe(UI_PALETTE_VARIABLES.length);
    expect(written.get("--ui-canvas-background")).toMatch(/^#/);
  });
});

