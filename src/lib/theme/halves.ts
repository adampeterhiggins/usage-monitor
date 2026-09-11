import { getThemeColorsForMode, getThemeDefinition } from "./registry";
import { isRecord, type ThemeAppearance, type ThemePreference } from "./types";

/**
 * An automatic-mode mix: a different theme per resolved appearance. Halves
 * only name real themes that can render their half; anything else is dropped
 * so a stale mix degrades to the base preference.
 */
export type ThemeHalves = Readonly<{ light?: string; dark?: string }>;

export function parseThemeHalves(raw: string | null): ThemeHalves | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value)) return null;
    const halves: { light?: string; dark?: string } = {};
    for (const appearance of ["light", "dark"] as const) {
      const themeId = value[appearance];
      if (typeof themeId !== "string") continue;
      const definition = getThemeDefinition(themeId);
      if (definition && getThemeColorsForMode(definition, appearance) !== null) {
        // Store the definition's id so legacy aliases resolve to the same
        // value the runtime applies to the document.
        halves[appearance] = definition.id;
      }
    }
    return halves.light !== undefined || halves.dark !== undefined ? halves : null;
  } catch {
    return null;
  }
}

/** Parse a stored `themeHalves` value — a JSON string or a plain record. */
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

/** The theme that should render the given appearance under a mix, if any. */
export function resolveThemeHalf(
  theme: ThemePreference,
  halves: ThemeHalves | null,
  appearance: ThemeAppearance,
): ThemePreference {
  return halves?.[appearance] ?? theme;
}
