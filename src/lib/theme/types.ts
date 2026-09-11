import {
  BUILT_IN_THEMES,
  EMBER_THEME,
  GROVE_THEME,
  IRIS_THEME,
  OCEAN_THEME,
  T3_CHAT_THEME,
  type ThemeAppearance,
} from "./themePalettes";

export {
  BUILT_IN_THEMES,
  EMBER_THEME,
  GROVE_THEME,
  IRIS_THEME,
  OCEAN_THEME,
  T3_CHAT_THEME,
};
export type { ThemeAppearance };

// The normalized model every application consumer works against.
export {
  APP_OVERRIDE_ROLES,
  APP_OVERRIDE_ROLE_SET,
  createThemeDefinition,
  getThemeSpecForMode,
  getThemeSourceModes,
  themeFileIdentity,
} from "./source-types";
export type {
  AppModeSpec,
  AppOverrideRole,
  ThemeDefinition,
} from "./source-types";

export const T3_CHAT_THEME_ID = "t3-chat" as const;
export const T3_CHAT_THEME_LABEL = "T3 Chat";
export const GROVE_THEME_ID = "grove" as const;
export const GROVE_THEME_LABEL = "Grove";
export const OCEAN_THEME_ID = "ocean" as const;
export const OCEAN_THEME_LABEL = "Ocean";
export const EMBER_THEME_ID = "ember" as const;
export const EMBER_THEME_LABEL = "Ember";
export const IRIS_THEME_ID = "iris" as const;
export const IRIS_THEME_LABEL = "Iris";
export type ThemePreference = string;
export type ThemePreferenceMode = ThemeAppearance | "system";
export type ThemeCollection = Readonly<{ id: string; label: string }>;

export const RESERVED_THEME_IDS = new Set([
  "system",
  "light",
  "dark",
  T3_CHAT_THEME_ID,
  GROVE_THEME_ID,
  OCEAN_THEME_ID,
  EMBER_THEME_ID,
  IRIS_THEME_ID,
]);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isThemeAppearance(value: unknown): value is ThemeAppearance {
  return value === "light" || value === "dark";
}

export function isThemeId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9](?:[a-z0-9-]{0,47})$/.test(value);
}

export function isThemeLabel(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= 48;
}

export function parseThemeCollection(value: unknown): ThemeCollection | undefined {
  return isRecord(value) &&
    typeof value.id === "string" &&
    /^[a-z0-9][a-z0-9.:-]{0,127}$/i.test(value.id) &&
    isThemeLabel(value.label)
    ? { id: value.id, label: value.label.trim() }
    : undefined;
}

export function themeIdFromPreference(theme: ThemePreference): string {
  return theme;
}

export function themeIdFromName(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return normalized || "custom-theme";
}
