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
  applyAppearanceChrome,
  applyUsageMonitorTheme,
  systemPrefersDark,
} from "./apply";
import { applyThemeColorPreview } from "./preview";
import { createThemePreviewCoordinator } from "./preview-session";

export type { ThemePreviewSession } from "./preview-session";

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
  await emitEvent(APPEARANCE_CHANGED_EVENT);
}

/** Single owner of live draft previews in this window. Marketplace previews
 *  and the theme editor take turns; a superseded owner can never repaint over
 *  a newer draft. */
export const themePreview = createThemePreviewCoordinator({
  apply: ({ colors, appearance }) => applyThemeColorPreview(colors, appearance),
  restore: () => refreshAppliedAppearanceAndBroadcast(),
});

/** Repaint the live preview if one owns the document, else refresh the
 *  persisted appearance. Use for OS/broadcast changes so a draft is never
 *  silently wiped by a listener. */
export async function refreshAppearanceRespectingPreview(): Promise<void> {
  if (themePreview.repaint()) return;
  await refreshAppliedAppearance();
}
