/** Bridge theme preference, halves, and appearance chrome onto the document. */

import {
  DEFAULT_APPEARANCE_SETTINGS,
  type AppearanceSettings,
} from "./appearance";
import { applyAppearanceContrast } from "./contrast";
import { applyAppearanceFontVariables } from "./fonts";
import {
  applyThemePalette,
  getThemeDefinition,
  parseThemeHalves,
  resolveThemeAppearance,
  type ThemeHalves,
  type ThemePreference,
  type ThemePreferenceMode,
} from "./palette";

export type ThemeBootState = {
  theme: ThemePreference;
  appearanceMode: ThemePreferenceMode;
  themeHalves: ThemeHalves | null;
  appearance: AppearanceSettings;
};

const MEDIA_QUERY = "(prefers-color-scheme: dark)";

export function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(MEDIA_QUERY).matches;
}

export function applyUsageMonitorTheme(
  theme: ThemePreference,
  options: {
    appearanceMode?: ThemePreferenceMode;
    halves?: ThemeHalves | null;
    systemDark?: boolean;
  } = {},
): void {
  const root = document.documentElement;
  const systemDark = options.systemDark ?? systemPrefersDark();
  const appearanceMode = options.appearanceMode ?? (theme === "system" ? "system" : null);
  const halves = options.halves ?? null;

  if (theme === "system" || theme === "light" || theme === "dark") {
    // Clear palette vars and use the classic data-theme path.
    applyThemePalette("__none__");
    delete root.dataset.themeId;
    if (theme === "system") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", theme);
    }
    return;
  }

  const resolved = resolveThemeAppearance(
    theme,
    systemDark,
    appearanceMode === "system" || appearanceMode === null ? undefined : false,
    appearanceMode ?? undefined,
    halves,
  );
  const halfId = halves?.[resolved];
  const activeTheme = halfId && getThemeDefinition(halfId) ? halfId : theme;
  applyThemePalette(activeTheme, resolved);
  root.setAttribute("data-theme", resolved);
  root.classList.toggle("dark", resolved === "dark");
}

export function applyAppearanceChrome(settings: AppearanceSettings): void {
  const root = document.documentElement;
  applyAppearanceContrast(root, settings.appearanceContrast);
  root.style.setProperty("--glass-opacity", `${settings.glassOpacity}%`);
  applyAppearanceFontVariables(root, settings);
}

export function applyFullAppearance(state: ThemeBootState): void {
  applyUsageMonitorTheme(state.theme, {
    appearanceMode: state.appearanceMode,
    halves: state.themeHalves,
  });
  applyAppearanceChrome(state.appearance);
}

export function parseStoredHalves(raw: unknown): ThemeHalves | null {
  if (typeof raw === "string") return parseThemeHalves(raw);
  if (raw && typeof raw === "object") {
    try {
      return parseThemeHalves(JSON.stringify(raw));
    } catch {
      return null;
    }
  }
  return null;
}

export { DEFAULT_APPEARANCE_SETTINGS };
