import { beforeEach, expect, it, vi } from "vitest";
const effects = vi.hoisted(() => ({ appearance: vi.fn(), apply: vi.fn(), preview: vi.fn(), chrome: vi.fn() }));
vi.mock("../../platform/events", () => ({ emitEvent: vi.fn() }));
vi.mock("../settings/custom-themes", () => ({ loadCustomThemesIntoMemory: vi.fn() }));
vi.mock("../settings/theme", () => ({ getThemePreference: async () => "light", getAppearanceMode: async () => "light", getThemeHalves: async () => null }));
vi.mock("../settings/appearance", () => ({ getAppearanceSettings: effects.appearance }));
vi.mock("./apply", () => ({ applyUsageMonitorTheme: effects.apply, applyAppearanceChrome: effects.chrome, systemPrefersDark: () => false }));
vi.mock("./preview", () => ({ applyUiPalettePreview: effects.preview }));
import { DEFAULT_APPEARANCE_SETTINGS } from "./appearance";
import { getLastAppliedAppearanceSettings, refreshAppliedAppearance, refreshAppearanceRespectingPreview, themePreview } from "./controller";
const paint = { source: { seeds: { canvas: "#111", accent: "#8844cc" } }, appearance: "dark" as const };
beforeEach(async () => {
  await themePreview.active()?.end();
  vi.clearAllMocks();
  effects.appearance.mockResolvedValue(DEFAULT_APPEARANCE_SETTINGS);
});

it("refreshes contrast settings without overwriting the active draft", async () => {
  const session = themePreview.begin();
  session.show(paint);
  const appearance = { ...DEFAULT_APPEARANCE_SETTINGS, appearanceContrast: 200, glassOpacity: 40 };
  effects.appearance.mockResolvedValue(appearance);
  await refreshAppearanceRespectingPreview();
  expect(effects.apply).not.toHaveBeenCalled();
  expect(effects.preview).toHaveBeenLastCalledWith(paint, { appearanceContrast: 200, glassOpacity: 40 });
  expect(getLastAppliedAppearanceSettings()).toBe(appearance);
  expect(effects.chrome).toHaveBeenLastCalledWith(appearance);
  await session.end({ restore: true });
  expect(effects.apply).toHaveBeenCalledOnce();
});

it("an asynchronous restore cannot paint over a newly opened editor", async () => {
  let finish!: (value: typeof DEFAULT_APPEARANCE_SETTINGS) => void;
  effects.appearance.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const old = themePreview.begin();
  old.show(paint);
  const ending = old.end({ restore: true });
  await vi.waitFor(() => expect(finish).toBeDefined());
  const current = themePreview.begin();
  const next = { ...paint, source: { seeds: { canvas: "#222", accent: "#4488cc" } } };
  current.show(next);
  finish(DEFAULT_APPEARANCE_SETTINGS);
  await ending;
  expect(effects.apply).not.toHaveBeenCalled();
  expect(effects.preview.mock.lastCall?.[0]).toBe(next);
});

it("discards an older settings refresh that finishes after a newer one", async () => {
  let finish!: (value: typeof DEFAULT_APPEARANCE_SETTINGS) => void;
  effects.appearance.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const old = refreshAppliedAppearance();
  await vi.waitFor(() => expect(finish).toBeDefined());
  const latest = { ...DEFAULT_APPEARANCE_SETTINGS, appearanceContrast: 200 };
  effects.appearance.mockResolvedValue(latest);
  await refreshAppliedAppearance();
  finish(DEFAULT_APPEARANCE_SETTINGS);
  await old;
  expect(getLastAppliedAppearanceSettings()).toBe(latest);
  expect(effects.apply).toHaveBeenCalledOnce();
});
