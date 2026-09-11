import { expect, it } from "vitest";
import { customThemesStorageSnapshot, getCustomThemes, hydrateCustomThemeLibrary, updateCustomTheme } from "./custom-library";
import { parseThemeFile } from "./theme-file";

it("editing preserves unknown metadata but removes cleared known overrides", () => {
  const base = { version: 2, id: "test-edit", name: "Editable", appearance: "light", seeds: { canvas: "#fff", accent: "#8844cc" } };
  hydrateCustomThemeLibrary([{ ...base, panelOpacity: 0.8, future: { retained: true }, seeds: { ...base.seeds, futureSeed: "x" }, overrides: { textPrimary: "#111", futureRole: "#abc" }, variants: { dark: { seeds: { canvas: "#111", accent: "#aabbcc" }, futureMode: true, overrides: { futureRole: "#def", textPrimary: "#fff" } } } }]);
  const next = parseThemeFile({ ...base, name: "Edited", variants: { dark: { seeds: { canvas: "#222", accent: "#aabbcc" } } } });
  updateCustomTheme(next.id, next);
  expect(customThemesStorageSnapshot()[0]).toMatchObject({ future: { retained: true }, seeds: { futureSeed: "x" }, overrides: { futureRole: "#abc" }, variants: { dark: { futureMode: true, overrides: { futureRole: "#def" } } } });
  const row = customThemesStorageSnapshot()[0] as { overrides: object; variants: { dark: { overrides: object } } };
  expect(row).not.toHaveProperty("panelOpacity");
  expect(row.overrides).not.toHaveProperty("textPrimary");
  expect(row.variants.dark.overrides).not.toHaveProperty("textPrimary");
  expect(getCustomThemes()[0].label).toBe("Edited");
  expect(() => updateCustomTheme(next.id, { ...next, id: "different" })).toThrow(/retain/);
});
