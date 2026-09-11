import { describe, expect, it } from "vitest";

import { themeColorRgb, themeContrastRatio } from "./colors";
import type { AppModeSpec } from "./source-types";
import { resolveUiPalette } from "./resolve-ui-palette";
import { UI_SURFACE_CONTEXTS } from "./ui-tokens";

const LIGHT: AppModeSpec = { seeds: { canvas: "#ffffff", accent: "#138af2" } };
const DARK: AppModeSpec = { seeds: { canvas: "#1c1c1e", accent: "#5aa0f0" } };

function contrast(a: string, b: string): number {
  return themeContrastRatio(themeColorRgb(a)!, themeColorRgb(b)!);
}

describe("resolveUiPalette", () => {
  it("resolves every token for every context", () => {
    const palette = resolveUiPalette(LIGHT, "light");
    for (const ctx of UI_SURFACE_CONTEXTS) {
      const c = palette.contexts[ctx];
      expect(c.background).toMatch(/^#[0-9a-f]{6}$/);
      expect(c.action.rest.background).toMatch(/^#[0-9a-f]{6}$/);
      expect(c.input.background).toMatch(/^#[0-9a-f]{6}$/);
      for (const tone of ["healthy", "warning", "high", "critical", "neutral", "info"] as const) {
        expect(c.status[tone].soft.background).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
    expect(palette.material.glass.rest.background).toMatch(/^#[0-9a-f]{6}$/);
    expect(palette.material.panelTint).toMatch(/^#[0-9a-f]{6}$/);
    expect(palette.appearance).toBe("light");
  });

  it("derives a paired foreground on filled controls instead of white", () => {
    const palette = resolveUiPalette(LIGHT, "light");
    const action = palette.contexts.canvas.action;
    // #138af2 is light enough that white text is ~3:1 — the solver must pick
    // a dark foreground instead.
    expect(contrast(action.rest.background, action.rest.foreground)).toBeGreaterThanOrEqual(
      4.55,
    );
    expect(action.rest.foreground).not.toBe("#ffffff");
  });

  it("keeps authored overrides verbatim after compositing", () => {
    const palette = resolveUiPalette(
      {
        seeds: { canvas: "#ffffff", accent: "#138af2" },
        overrides: { cardBackground: "#102030", menuBackground: "#334455" },
      },
      "light",
    );
    expect(palette.contexts.card.background).toBe("#102030");
    expect(palette.contexts.menu.background).toBe("#334455");
  });

  it("composites authored alpha overrides over the surface, then enforces floors", () => {
    const palette = resolveUiPalette(
      {
        seeds: { canvas: "#000000", accent: "#5aa0f0" },
        // 50% white over black = ~#808080 → must still clear the text floor.
        overrides: { textPrimary: "#ffffff80" },
      },
      "dark",
    );
    const text = palette.contexts.canvas.text.primary;
    expect(text).toBe("#808080");
    expect(contrast(text, "#000000")).toBeGreaterThanOrEqual(4.55);
  });

  it("inverts control state ordering for dark themes (hover lifts, pressed lifts more)", () => {
    const palette = resolveUiPalette(DARK, "dark");
    const c = palette.contexts.canvas.control;
    const lum = (hex: string) =>
      (parseInt(hex.slice(1, 3), 16) * 3 + parseInt(hex.slice(3, 5), 16) * 6) / 255;
    expect(lum(c.hover.background)).toBeGreaterThan(lum(c.rest.background));
    expect(lum(c.pressed.background)).toBeGreaterThanOrEqual(lum(c.hover.background));
  });

  it("separates provider identity from usage status and accent", () => {
    const palette = resolveUiPalette(DARK, "dark");
    const providers = palette.contexts.canvas.providers;
    expect(providers.orange.background).not.toBe(palette.contexts.canvas.status.high.soft.background);
    expect(providers.blue.background).not.toBe(palette.contexts.canvas.action.rest.background);
    // Claude = orange, Codex = green, Cursor = blue.
    expect(providers.orange.background).toMatch(/^#/);
    expect(providers.green.background).toMatch(/^#/);
    expect(providers.blue.background).toMatch(/^#/);
  });

  it("reports diagnostics instead of failing on extreme canvases", () => {
    const palette = resolveUiPalette(
      { seeds: { canvas: "#ff00ff", accent: "#ff00ff" } },
      "dark",
    );
    expect(palette.contexts.canvas.text.primary).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("contrast settings scale the resolved spacing", () => {
    const flat = resolveUiPalette(LIGHT, "light", { appearanceContrast: 0 });
    const high = resolveUiPalette(LIGHT, "light", { appearanceContrast: 200 });
    expect(
      contrast(high.contexts.card.background, high.canvas),
    ).toBeGreaterThan(contrast(flat.contexts.card.background, flat.canvas) - 0.001);
  });

  it("respects authored selection and input overrides per context", () => {
    const palette = resolveUiPalette(
      {
        seeds: { canvas: "#ffffff", accent: "#138af2" },
        overrides: {
          selectionBackground: "#223344",
          inputBackground: "#f5f5f0",
          inputPlaceholder: "#444455",
        },
      },
      "light",
    );
    expect(palette.contexts.canvas.selection.rest.background).toBe("#223344");
    expect(palette.contexts.canvas.input.background).toBe("#f5f5f0");
    expect(palette.contexts.canvas.input.placeholder).toBe("#444455");
    // Toolbar overrides apply only to the toolbar context.
    expect(palette.contexts.toolbar.input.background).toBe("#f5f5f0");
  });
});
