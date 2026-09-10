import { emit } from "@tauri-apps/api/event";
import { APPEARANCE_CHANGED_EVENT } from "../appearance-window";
import { getAppearanceSettings } from "../settings/appearance";
import { loadCustomThemesIntoMemory } from "../settings/custom-themes";
import {
  getAppearanceMode,
  getThemeHalves,
  getThemePreference,
} from "../settings/theme";
import {
  applyAppearanceChrome,
  applyUsageMonitorTheme,
  systemPrefersDark,
} from "./apply";

export async function refreshAppliedAppearance(): Promise<void> {
  await loadCustomThemesIntoMemory();
  const [theme, appearanceMode, halves, appearance] = await Promise.all([
    getThemePreference(),
    getAppearanceMode(),
    getThemeHalves(),
    getAppearanceSettings(),
  ]);
  applyUsageMonitorTheme(theme, {
    appearanceMode,
    halves,
    systemDark: systemPrefersDark(),
  });
  applyAppearanceChrome(appearance);
}

/** Apply locally, then notify other windows (e.g. main panel ↔ Appearance). */
export async function refreshAppliedAppearanceAndBroadcast(): Promise<void> {
  await refreshAppliedAppearance();
  await emit(APPEARANCE_CHANGED_EVENT, null);
}
