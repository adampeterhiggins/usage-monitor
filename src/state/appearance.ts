/** Appearance window state owner.
 *
 *  One module owns the hydrated snapshot (theme, mode, halves, control
 *  settings, presets) and every persisted mutation. Writes run through a
 *  serial queue so rapid control changes merge against the latest state
 *  instead of racing the settings store, and the snapshot only publishes
 *  state that was actually persisted — a failed write rolls the snapshot
 *  back and reports the error to the caller. */

import * as React from "react";
import { create } from "zustand";

import {
  DEFAULT_APPEARANCE_SETTINGS,
  normalizeAppearanceSettings,
  type AppearancePreset,
  type AppearanceSettings,
} from "../lib/theme/appearance";
import { getCustomThemes, subscribeToCustomThemes } from "../lib/theme/custom-library";
import type { ThemeHalves } from "../lib/theme/halves";
import { refreshAppliedAppearanceAndBroadcast } from "../lib/theme/controller";
import type { ThemePreference, ThemePreferenceMode } from "../lib/theme/types";
import {
  applyAppearancePreset,
  deleteAppearancePreset,
  getAppearanceMode,
  getAppearancePresets,
  getAppearanceSettings,
  getThemeHalves,
  getThemePreference,
  loadCustomThemesIntoMemory,
  saveAppearancePreset,
  setAppearanceMode,
  setAppearanceSettings,
  setThemeHalves,
  setThemePreference,
} from "../lib/settings/index";

export interface AppearanceSnapshot {
  hydrated: boolean;
  theme: ThemePreference;
  mode: ThemePreferenceMode;
  halves: ThemeHalves | null;
  settings: AppearanceSettings;
  presets: AppearancePreset[];
}

interface AppearanceStore extends AppearanceSnapshot {
  hydrate(): Promise<void>;
  selectTheme(next: ThemePreference): Promise<void>;
  setMode(next: ThemePreferenceMode): Promise<void>;
  setThemeHalf(half: "light" | "dark", themeId: string | ""): Promise<void>;
  patchSettings(patch: Partial<AppearanceSettings>): Promise<void>;
  savePreset(name: string): Promise<AppearancePreset>;
  applyPreset(id: string): Promise<void>;
  deletePreset(id: string): Promise<void>;
}

/** Serialized persistence: each queued write sees the document left by the
 *  previous one, and a failed write does not poison later mutations. */
let writeQueue: Promise<unknown> = Promise.resolve();
function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(operation, operation);
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export const useAppearanceStore = create<AppearanceStore>((set, get) => {
  /** Optimistically publish `next`, persist it, then repaint+broadcast.
   *  On persistence failure the snapshot rolls back so it never advertises
   *  state that was not saved. */
  async function mutate<K extends "theme" | "mode" | "halves" | "settings">(
    key: K,
    next: AppearanceSnapshot[K],
    persist: () => Promise<void>,
  ): Promise<void> {
    const previous = get()[key];
    set({ [key]: next } as Pick<AppearanceSnapshot, K>);
    try {
      await persist();
    } catch (error) {
      set({ [key]: previous } as Pick<AppearanceSnapshot, K>);
      throw error;
    }
    await refreshAppliedAppearanceAndBroadcast();
  }

  return {
    hydrated: false,
    theme: "light",
    mode: "system",
    halves: null,
    settings: DEFAULT_APPEARANCE_SETTINGS,
    presets: [],

    async hydrate() {
      await loadCustomThemesIntoMemory();
      const [theme, mode, halves, settings, presets] = await Promise.all([
        getThemePreference(),
        getAppearanceMode(),
        getThemeHalves(),
        getAppearanceSettings(),
        getAppearancePresets(),
      ]);
      set({ hydrated: true, theme, mode, halves, settings, presets });
    },

    selectTheme: (next) =>
      enqueue(() =>
        mutate("theme", next, () => setThemePreference(next)),
      ),

    setMode: (next) =>
      enqueue(() => mutate("mode", next, () => setAppearanceMode(next))),

    setThemeHalf: (half, themeId) =>
      enqueue(() => {
        const next: { light?: string; dark?: string } = { ...(get().halves ?? {}) };
        if (!themeId) delete next[half];
        else next[half] = themeId;
        const cleaned: ThemeHalves | null = next.light || next.dark ? next : null;
        return mutate("halves", cleaned, () => setThemeHalves(cleaned));
      }),

    patchSettings: (patch) =>
      enqueue(() => {
        const next = normalizeAppearanceSettings({ ...get().settings, ...patch });
        return mutate("settings", next, async () => {
          await setAppearanceSettings(patch);
        });
      }),

    savePreset: (name) =>
      enqueue(async () => {
        const { settings, theme, mode, halves } = get();
        const saved = await saveAppearancePreset({ name, settings, theme, mode, halves });
        set({ presets: await getAppearancePresets() });
        return saved;
      }),

    applyPreset: (id) =>
      enqueue(async () => {
        const applied = await applyAppearancePreset(id);
        set({
          settings: applied.settings,
          theme: applied.theme,
          mode: applied.mode,
          halves: applied.halves,
        });
        await refreshAppliedAppearanceAndBroadcast();
      }),

    deletePreset: (id) =>
      enqueue(async () => {
        await deleteAppearancePreset(id);
        set({ presets: await getAppearancePresets() });
      }),
  };
});

/** Custom themes live in the library's own store; this just subscribes. */
export function useCustomThemes() {
  return React.useSyncExternalStore(subscribeToCustomThemes, getCustomThemes, () => []);
}
