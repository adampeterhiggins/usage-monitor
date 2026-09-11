import { getCustomThemes } from "./custom-library";
import { getThemeSourceModes } from "./source-types";
import { BUILT_IN_THEMES } from "./themePalettes";
import {
  themeIdFromPreference,
  type ThemeAppearance,
  type ThemeDefinition,
  type ThemePreference,
} from "./types";

export function getThemeDefinition(theme: ThemePreference): ThemeDefinition | null {
  const themeId = themeIdFromPreference(theme);
  return (
    BUILT_IN_THEMES.find((definition) => definition.id === themeId) ??
    getCustomThemes().find((definition) => definition.id === themeId) ??
    null
  );
}

export function getThemeModes(theme: ThemeDefinition): ReadonlyArray<ThemeAppearance> {
  return getThemeSourceModes(theme);
}

export function getThemePreferenceMode(theme: ThemePreference): ThemeAppearance | null {
  if (theme === "system") return null;
  if (theme === "light" || theme === "dark") return theme;
  return getThemeDefinition(theme)?.appearance ?? null;
}

export function isKnownThemePreference(theme: string): boolean {
  if (theme === "light" || theme === "dark" || theme === "system") return true;
  return getThemeDefinition(theme) !== null;
}
