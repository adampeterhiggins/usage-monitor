/** Normalized theme model.
 *
 *  Three layers stay distinct through the pipeline:
 *
 *  1. External source files (theme-file JSON, VS Code workbench files) —
 *     parsed at the edge, never stored verbatim.
 *  2. `ThemeDefinition` — the normalized in-memory theme: an id/label plus an
 *     independent `AppModeSpec` per supported appearance.
 *  3. `ResolvedUiPalette` — the complete, ephemeral per-mode palette the
 *     resolver computes for application. Never persisted.
 *
 *  A spec is two seeds plus a finite set of role overrides; missing opposite
 *  modes stay missing: `theme.modes` only ever contains what the author
 *  supplied. */

import type { ThemeAppearance } from "./themePalettes";
import {
  isThemeId,
  isThemeLabel,
  RESERVED_THEME_IDS,
  themeIdFromName,
  type ThemeCollection,
} from "./types";

/** Every role an `overrides` map may name. The resolver maps each onto the
 *  resolved palette; anything outside this list is rejected at parse time. */
export const APP_OVERRIDE_ROLES = [
  // Context surfaces
  "cardBackground",
  "cardForeground",
  "menuBackground",
  "menuForeground",
  "toolbarBackground",
  "toolbarForeground",
  // Text hierarchy
  "textPrimary",
  "textSecondary",
  "textTertiary",
  "placeholder",
  // Neutral control states
  "controlBackground",
  "controlForeground",
  "controlHoverBackground",
  // Primary action states
  "actionBackground",
  "actionForeground",
  "actionHoverBackground",
  // Destructive action
  "destructiveForeground",
  // Selection
  "selectionBackground",
  "selectionForeground",
  "selectionHoverBackground",
  // Inputs
  "inputBackground",
  "inputForeground",
  "inputPlaceholder",
  "inputBorder",
  // Borders and focus
  "borderSubtle",
  "borderControl",
  "focusRing",
  // Accent used as readable text/icons
  "accentText",
  // Status seeds (per-tone; neutral is derived)
  "healthy",
  "warning",
  "high",
  "critical",
] as const;

export type AppOverrideRole = (typeof APP_OVERRIDE_ROLES)[number];

export const APP_OVERRIDE_ROLE_SET: ReadonlySet<string> = new Set(APP_OVERRIDE_ROLES);

export interface AppModeSpec {
  /** The two colors every mode must carry. */
  seeds: Readonly<{ canvas: string; accent: string }>;
  /** Optional role overrides; empty is valid. */
  overrides?: Readonly<Partial<Record<AppOverrideRole, string>>>;
  /** Authored window-plane translucency (0–1). Absent → the resolver picks
   *  the lowest opacity that keeps text readable over arbitrary backdrops. */
  panelOpacity?: number;
}

/** The normalized theme every consumer works against. */
export type ThemeDefinition = Readonly<{
  id: string;
  label: string;
  /** The appearance the base mode renders. */
  appearance: ThemeAppearance;
  /** Independent specs per appearance; `modes[appearance]` always exists. */
  modes: Readonly<Partial<Record<ThemeAppearance, AppModeSpec>>>;
  /** Groups related imported variants into one library card. */
  collection?: ThemeCollection;
  /** Generated/edited through the guided editor. */
  managed?: boolean;
}>;

/** The spec a definition carries for `mode`, or null when it lacks it. */
export function getThemeSpecForMode(
  theme: ThemeDefinition,
  mode: ThemeAppearance,
): AppModeSpec | null {
  return theme.modes[mode] ?? null;
}

/** Modes this definition can render without falling back. */
export function getThemeSourceModes(theme: ThemeDefinition): ReadonlyArray<ThemeAppearance> {
  return (["light", "dark"] as const).filter((mode) => theme.modes[mode] !== undefined);
}

/**
 * Validate identity metadata and build a normalized definition. `modes` must
 * contain `appearance`. Used by the file parser, the storage parser, and the
 * VS Code importer so they all share the same identity rules.
 */
export function createThemeDefinition(input: {
  id: string;
  label: string;
  appearance: ThemeAppearance;
  modes: Partial<Record<ThemeAppearance, AppModeSpec>>;
  collection?: ThemeCollection;
  managed?: boolean;
}): ThemeDefinition {
  if (!isThemeId(input.id)) {
    throw new Error("Theme ids may only contain lowercase letters, numbers, and hyphens.");
  }
  if (RESERVED_THEME_IDS.has(input.id)) {
    throw new Error(`The theme id "${input.id}" is reserved.`);
  }
  if (!isThemeLabel(input.label)) {
    throw new Error("Theme files need a name (48 characters or fewer).");
  }
  const modes = input.modes;
  if (!modes[input.appearance]) {
    throw new Error(`Theme "${input.label}" is missing its base "${input.appearance}" mode.`);
  }
  return {
    id: input.id,
    label: input.label.trim(),
    appearance: input.appearance,
    modes: { ...modes },
    ...(input.collection ? { collection: input.collection } : {}),
    ...(input.managed === true ? { managed: true } : {}),
  };
}

/** Validate a suggested label/id pair for files that supply only a name. */
export function themeFileIdentity(
  name: string,
  explicitId?: string,
): { id: string; label: string } {
  if (!isThemeLabel(name)) {
    throw new Error("Theme files need a name (48 characters or fewer).");
  }
  const id = explicitId === undefined ? themeIdFromName(name) : explicitId;
  if (!isThemeId(id)) {
    throw new Error("Theme ids may only contain lowercase letters, numbers, and hyphens.");
  }
  if (RESERVED_THEME_IDS.has(id)) {
    throw new Error(`The theme id "${id}" is reserved.`);
  }
  return { id, label: name.trim() };
}
