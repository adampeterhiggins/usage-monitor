/** Bridge theme preference, halves, and appearance chrome onto the document. */

import {
  DEFAULT_APPEARANCE_SETTINGS,
  type AppearanceSettings,
} from "./appearance";
import { applyAppearanceFontVariables } from "./fonts";
import { formTokensToCssVariables, FORM_TOKEN_VARIABLES } from "./form-tokens";
import { resolveFormTokens } from "./identities";
import type { ThemeHalves } from "./halves";
import { resolveThemeHalf } from "./halves";
import { applyThemePalette } from "./preview";
import { getThemeDefinition } from "./registry";
import { resolveThemeAppearance } from "./resolve";
import type { ThemeAppearance, ThemePreference, ThemePreferenceMode } from "./types";

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

function paletteOptions(appearance: AppearanceSettings) {
  return {
    appearanceContrast: appearance.appearanceContrast,
    glassOpacity: appearance.glassOpacity,
  };
}

export function applyUsageMonitorTheme(
  theme: ThemePreference,
  options: {
    appearanceMode?: ThemePreferenceMode;
    halves?: ThemeHalves | null;
    systemDark?: boolean;
    appearance?: AppearanceSettings;
  } = {},
): void {
  const root = document.documentElement;
  const systemDark = options.systemDark ?? systemPrefersDark();
  const appearanceMode = options.appearanceMode ?? (theme === "system" ? "system" : null);
  const halves = options.halves ?? null;
  const appearance = options.appearance ?? DEFAULT_APPEARANCE_SETTINGS;

  if (theme === "system" || theme === "light" || theme === "dark") {
    // The stock look still goes through the resolver — same pipeline as any
    // installed theme — but it reads its own authored sources.
    const resolved: ThemeAppearance =
      theme === "system" ? (systemDark ? "dark" : "light") : theme;
    applyThemePalette(theme === "system" ? resolved : theme, resolved, paletteOptions(appearance));
    root.setAttribute("data-theme", resolved);
    root.classList.toggle("dark", resolved === "dark");
    return;
  }

  const resolved = resolveThemeAppearance(
    theme,
    systemDark,
    appearanceMode === "system" || appearanceMode === null ? undefined : false,
    appearanceMode ?? undefined,
    halves,
  );
  const halfId = resolveThemeHalf(theme, halves, resolved);
  const activeTheme = halfId !== theme && getThemeDefinition(halfId) ? halfId : theme;
  applyThemePalette(activeTheme, resolved, paletteOptions(appearance));
  root.setAttribute("data-theme", resolved);
  root.classList.toggle("dark", resolved === "dark");
}

/** Paint the identity's `--form-*` set onto the root element.
 *
 *  Written after the font variables so the identity can read `--font-sans` /
 *  `--font-mono`, and onto `:root` so every surface — panel, dialogs, and the
 *  Appearance preview rail — inherits one set. */
export function applyIdentity(settings: AppearanceSettings): void {
  const root = document.documentElement;
  if (!root?.style) return;
  const vars = formTokensToCssVariables(
    resolveFormTokens(settings.identity, { customSansFontStack: settings.fontFamilySans }),
  );
  for (const name of FORM_TOKEN_VARIABLES) {
    const value = vars[name];
    if (value !== undefined) root.style.setProperty(name, value);
  }
  root.setAttribute("data-identity", settings.identity);
}

export function applyAppearanceChrome(settings: AppearanceSettings): void {
  const root = document.documentElement;
  applyAppearanceFontVariables(root, settings);
  applyIdentity(settings);
}

export function applyFullAppearance(state: ThemeBootState): void {
  applyUsageMonitorTheme(state.theme, {
    appearanceMode: state.appearanceMode,
    halves: state.themeHalves,
    appearance: state.appearance,
  });
  applyAppearanceChrome(state.appearance);
}

export { DEFAULT_APPEARANCE_SETTINGS };
