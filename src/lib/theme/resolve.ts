import { getThemeDefinition, getThemePreferenceMode } from "./registry";
import { getThemeSpecForMode } from "./source-types";
import type { ThemeHalves } from "./halves";
import type { ThemePreference, ThemePreferenceMode } from "./types";

export function resolveThemeAppearance(
  theme: ThemePreference,
  systemDark: boolean,
  followSystem?: boolean,
  appearanceMode?: ThemePreferenceMode,
  halves?: ThemeHalves | null,
): "light" | "dark" {
  const systemAppearance = systemDark ? "dark" : "light";
  const mode = appearanceMode ?? ((followSystem ?? theme === "system") ? "system" : null);
  if (mode === "system") {
    // A configured half guarantees the appearance is renderable even when the
    // base theme lacks that mode.
    if (halves?.[systemAppearance]) return systemAppearance;
    const definition = getThemeDefinition(theme);
    return definition && getThemeSpecForMode(definition, systemAppearance) === null
      ? definition.appearance
      : systemAppearance;
  }
  if (mode === "light" || mode === "dark") {
    if (halves?.[mode]) return mode;
    const definition = getThemeDefinition(theme);
    return definition && getThemeSpecForMode(definition, mode) === null
      ? definition.appearance
      : mode;
  }
  return getThemePreferenceMode(theme) ?? "light";
}

export function resolveDesktopTheme(
  theme: ThemePreference,
  followSystem?: boolean,
  appearanceMode?: ThemePreferenceMode,
  halves?: ThemeHalves | null,
): "light" | "dark" | "system" {
  const mode = appearanceMode ?? ((followSystem ?? theme === "system") ? "system" : null);
  if (mode === "system") {
    const definition = getThemeDefinition(theme);
    // A configured half fills in an appearance the base theme cannot render.
    const hasLightMode =
      halves?.light !== undefined ||
      (definition !== null && getThemeSpecForMode(definition, "light") !== null);
    const hasDarkMode =
      halves?.dark !== undefined ||
      (definition !== null && getThemeSpecForMode(definition, "dark") !== null);
    return definition && (!hasLightMode || !hasDarkMode) ? definition.appearance : "system";
  }
  if (mode === "light" || mode === "dark") {
    if (halves?.[mode]) return mode;
    const definition = getThemeDefinition(theme);
    return definition && getThemeSpecForMode(definition, mode) === null
      ? definition.appearance
      : mode;
  }
  return getThemePreferenceMode(theme) ?? "system";
}
