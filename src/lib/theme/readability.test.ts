import { describe, expect, it } from "vitest";
import { themeColorRgb, themeContrastRatio } from "./colors";
import { BUILT_IN_THEMES } from "./themePalettes";
import { resolveUiPalette } from "./resolve-ui-palette";
import type { AppModeSpec } from "./source-types";
const contrast = (a: string, b: string) => themeContrastRatio(themeColorRgb(a)!, themeColorRgb(b)!);
const stress: AppModeSpec = {
  seeds: { canvas: "#101010", accent: "#333333" },
  overrides: {
    cardBackground: "#fafafa", menuBackground: "#ffffff", toolbarBackground: "#eeeeee",
    textPrimary: "#eeeeee", textSecondary: "#222222", textTertiary: "#ffffff", placeholder: "#eeeeee",
    controlBackground: "#222222", controlHoverBackground: "#eeeeee", controlForeground: "#eeeeee80",
    actionBackground: "#333333", actionHoverBackground: "#eeeeee", actionForeground: "#cccccc",
    selectionBackground: "#ffffff", selectionForeground: "#ffffff",
    inputBackground: "#ffffff", inputForeground: "#ffffff", inputPlaceholder: "#ffffff",
    focusRing: "#eeeeee", borderControl: "#eeeeee", inputBorder: "#ffffff",
    accentText: "#101010", healthy: "#101010", warning: "#eeeeee", critical: "#eeeeee",
  },
  panelOpacity: 0.1,
};
const fixtures = [
  ...BUILT_IN_THEMES.flatMap(theme => (["light", "dark"] as const).flatMap(mode => theme.modes[mode] ? [{ name: `${theme.id}/${mode}`, mode, spec: theme.modes[mode]! }] : [])),
  { name: "mixed authored surfaces", mode: "dark" as const, spec: stress },
  ...["#777777", "#ff00ff", "#ffffff", "#000000"].map(canvas => ({ name: canvas, mode: "dark" as const, spec: { seeds: { canvas, accent: canvas } } })),
];

describe.each(fixtures)("readability: $name", ({ spec, mode }) => {
  it.each([50, 100, 200])("keeps text and all enabled pairs readable at contrast %i", appearanceContrast => {
    const before = JSON.stringify(spec);
    const palette = resolveUiPalette(spec, mode, { appearanceContrast });
    for (const [name, c] of Object.entries(palette.contexts)) {
      const label = `${name} at ${appearanceContrast}`;
      const levels = [c.text.primary, c.text.secondary, c.text.tertiary].map(color => contrast(color, c.background));
      levels.forEach(value => expect(value, label).toBeGreaterThanOrEqual(4.5));
      expect(levels[1], label).toBeLessThanOrEqual(levels[0] + 0.04);
      expect(levels[2], label).toBeLessThanOrEqual(levels[1] + 0.04);
      for (const family of [c.control, c.action, c.destructive]) {
        for (const state of [family.rest, family.hover, family.pressed]) {
          expect(contrast(state.foreground, state.background), label).toBeGreaterThanOrEqual(4.5);
        }
      }
      for (const pair of [c.selection.rest, c.selection.hover, c.input, ...Object.values(c.providers), ...Object.values(c.status).map(t => t.soft)]) {
        expect(contrast(pair.foreground, pair.background), label).toBeGreaterThanOrEqual(4.5);
      }
      for (const [tone, status] of Object.entries(c.status)) {
        if (tone !== "neutral") expect(contrast(status.fill, c.track), `${label}/${tone} track`).toBeGreaterThanOrEqual(3);
        expect(contrast(status.text, c.background), `${label}/${tone} text`).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(c.input.placeholder, c.input.background), label).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.accentText, c.background), label).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.borders.focus, c.background), label).toBeGreaterThanOrEqual(3);
    }
    expect(JSON.stringify(spec)).toBe(before);
  });
});

it("changes authored text with the contrast slider without changing its source", () => {
  const spec: AppModeSpec = { seeds: { canvas: "#ffffff", accent: "#8844cc" }, overrides: { textPrimary: "#333333", textSecondary: "#666666", textTertiary: "#777777" } };
  const low = resolveUiPalette(spec, "light", { appearanceContrast: 50 }).contexts.canvas.text;
  const high = resolveUiPalette(spec, "light", { appearanceContrast: 200 }).contexts.canvas.text;
  expect(contrast(high.secondary, "#fff")).toBeGreaterThan(contrast(low.secondary, "#fff") + 0.5);
});

it("switches action text when hover crosses from dark to light", () => {
  const action = resolveUiPalette(stress, "dark").contexts.canvas.action;
  expect(action.hover.foreground).not.toBe(action.rest.foreground);
  expect(contrast(action.rest.foreground, action.hover.background)).toBeLessThan(4.5);
});

it("composites input foreground alpha over the input, not its parent", () => {
  const p = resolveUiPalette({ seeds: { canvas: "#000", accent: "#8844cc" }, overrides: { inputBackground: "#fff", inputForeground: "#000000cc" } }, "dark");
  expect(p.contexts.canvas.input.foreground).toBe("#333333");
});
