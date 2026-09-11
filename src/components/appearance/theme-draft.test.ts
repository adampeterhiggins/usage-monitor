import { describe, expect, it } from "vitest";
import { parseThemeColor } from "../../lib/theme/colors";
import { parseThemeFile, serializeThemeFile } from "../../lib/theme/theme-file";
import { addDraftMode, colorPickerValue, draftToTheme, newThemeDraft, parseEditorColor, resetDraftMode, themeToDraft } from "./theme-draft";

describe("theme editor round trips", () => {
  it("displays canonical and alpha colours without replacing the source", () => {
    const theme = parseThemeFile({ version: 2, name: "Editor", appearance: "light", seeds: { canvas: "#ffffff", accent: "#8844cc80" } });
    const draft = themeToDraft(theme);
    expect(colorPickerValue(draft.modes.light!.seeds.accent)).toBe("#8844cc");
    expect(draftToTheme(draft).modes).toEqual(theme.modes);
    expect(parseEditorColor("oklch(0.6 0.1 280 / 0.5)")).toBe("oklch(0.6 0.1 280 / 0.5)");
    expect(parseEditorColor("rgb(20 40 60)")).not.toBeNull();
    expect(parseEditorColor("fff")).toBe("#fff");
    expect(parseEditorColor("var(--bad)")).toBeNull();
  });

  it("adds a dark appearance without copying light surfaces or changing the base", () => {
    const light = newThemeDraft({ seeds: { canvas: "#fff", accent: "#8844cc" }, overrides: { textPrimary: "#111", menuBackground: "#fff" } }, "light");
    const both = addDraftMode(light, "dark");
    expect(both.modes.light).toEqual(light.modes.light);
    expect(both.modes.dark!.overrides).toEqual({});
    expect(parseThemeColor(both.modes.dark!.seeds.canvas)!.color.L).toBeLessThan(0.3);
    expect(parseThemeColor(both.modes.dark!.seeds.accent)!.color.h).toBeCloseTo(parseThemeColor(light.modes.light!.seeds.accent)!.color.h, 2);
    const saved = parseThemeFile(JSON.parse(serializeThemeFile(draftToTheme(both))));
    expect(saved.appearance).toBe("light");
    expect(saved.modes.dark).toBeDefined();
  });

  it("rebuilds only the current mode while retaining its seeds and opacity", () => {
    const initial = newThemeDraft({ seeds: { canvas: "#fff", accent: "#8844cc" }, panelOpacity: 0.97, overrides: { textPrimary: "#222" } }, "light");
    const dual = addDraftMode(addDraftMode(initial, "dark"), "light");
    const rebuilt = resetDraftMode(dual);
    expect(rebuilt.modes.light!.overrides).toEqual({});
    expect(rebuilt.modes.light!.panelOpacity).toBe(0.97);
    expect(rebuilt.modes.light!.seeds).toEqual(initial.modes.light!.seeds);
    expect(rebuilt.modes.dark).toBe(dual.modes.dark);
    expect(dual.modes.light!.overrides.textPrimary).toBe("#222");
  });
});
