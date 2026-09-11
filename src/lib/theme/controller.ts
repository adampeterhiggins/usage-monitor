import { emitEvent } from "../../platform/events";
import { APPEARANCE_CHANGED_EVENT } from "../../platform/appearance-window";
import { getAppearanceSettings } from "../settings/appearance";
import { loadCustomThemesIntoMemory } from "../settings/custom-themes";
import {
  getAppearanceMode,
  getThemeHalves,
  getThemePreference,
} from "../settings/theme";
import {
  DEFAULT_APPEARANCE_SETTINGS,
  type AppearanceSettings,
} from "./appearance";
import {
  applyAppearanceChrome,
  applyUsageMonitorTheme,
  systemPrefersDark,
} from "./apply";
import { applyUiPalettePreview } from "./preview";
import { createThemePreviewCoordinator } from "./preview-session";

export type { ThemePreviewSession } from "./preview-session";

/**
 * The most recently applied appearance settings. Previews are painted through
 * the same resolver as production themes, with the same contrast/glass
 * settings, so a draft previews the way it will look when saved.
 */
let lastAppliedAppearance: AppearanceSettings = DEFAULT_APPEARANCE_SETTINGS;

export function getLastAppliedAppearanceSettings(): AppearanceSettings {
  return lastAppliedAppearance;
}

export async function refreshAppliedAppearance(): Promise<void> {
  await loadCustomThemesIntoMemory();
  const [theme, appearanceMode, halves, appearance] = await Promise.all([
    getThemePreference(),
    getAppearanceMode(),
    getThemeHalves(),
    getAppearanceSettings(),
  ]);
  lastAppliedAppearance = appearance;
  applyUsageMonitorTheme(theme, {
    appearanceMode,
    halves,
    systemDark: systemPrefersDark(),
    appearance,
  });
  applyAppearanceChrome(appearance);
}

/** Apply locally, then notify other windows (e.g. main panel ↔ Appearance). */
export async function refreshAppliedAppearanceAndBroadcast(): Promise<void> {
  await refreshAppliedAppearance();
  await emitEvent(APPEARANCE_CHANGED_EVENT);
}

/** Single owner of live draft previews in this window. Marketplace previews
 *  and the theme editor take turns; a superseded owner can never repaint over
 *  a newer draft. */
export const themePreview = createThemePreviewCoordinator({
  apply: (paint) => applyUiPalettePreview(paint, {
    appearanceContrast: lastAppliedAppearance.appearanceContrast,
    glassOpacity: lastAppliedAppearance.glassOpacity,
  }),
  restore: () => refreshAppliedAppearanceAndBroadcast(),
});

/** Repaint the live preview if one owns the document, else refresh the
 *  persisted appearance. Use for OS/broadcast changes so a draft is never
 *  silently wiped by a listener. */
export async function refreshAppearanceRespectingPreview(): Promise<void> {
  if (themePreview.repaint()) return;
  await refreshAppliedAppearance();
}
