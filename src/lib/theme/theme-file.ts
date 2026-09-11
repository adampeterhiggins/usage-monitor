/** Theme files on disk: a `seeds`/`overrides` app spec per mode. Parsing is
 *  strict — unknown roles and malformed values fail the file so authors get
 *  told what is wrong. Serialization always emits the current version. */

import { toCanonicalThemeColor } from "./colors";
import {
  APP_OVERRIDE_ROLE_SET,
  createThemeDefinition,
  themeFileIdentity,
  type AppModeSpec,
  type AppOverrideRole,
  type ThemeDefinition,
} from "./source-types";
import {
  isRecord,
  isThemeAppearance,
  isThemeLabel,
  parseThemeCollection,
  type ThemeAppearance,
} from "./types";

export const THEME_FILE_VERSION = 2 as const;

export interface ThemeFile {
  version: typeof THEME_FILE_VERSION;
  id: string;
  name: string;
  appearance: ThemeAppearance;
  seeds: { canvas: string; accent: string };
  overrides?: Partial<Record<AppOverrideRole, string>>;
  panelOpacity?: number;
  variants?: Partial<
    Record<
      ThemeAppearance,
      {
        seeds: { canvas: string; accent: string };
        overrides?: Partial<Record<AppOverrideRole, string>>;
        panelOpacity?: number;
      }
    >
  >;
  collection?: { id: string; label: string };
  managed?: boolean;
}

function parseColorValue(value: unknown, role: string): string {
  const normalized = toCanonicalThemeColor(value);
  if (!normalized) {
    throw new Error(
      `The color for "${role}" must be a literal CSS color such as oklch(0.62 0.2 280).`,
    );
  }
  return normalized;
}

function parseAppSeeds(value: unknown): AppModeSpec["seeds"] {
  if (!isRecord(value)) throw new Error("Theme seeds must be an object.");
  return {
    canvas: parseColorValue(value.canvas, "canvas"),
    accent: parseColorValue(value.accent, "accent"),
  };
}

function parseAppOverrides(value: unknown): AppModeSpec["overrides"] {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("Theme overrides must be an object.");
  const overrides: Partial<Record<AppOverrideRole, string>> = {};
  for (const [role, color] of Object.entries(value)) {
    if (!APP_OVERRIDE_ROLE_SET.has(role)) {
      throw new Error(`"${role}" is not a supported theme override role.`);
    }
    overrides[role as AppOverrideRole] = parseColorValue(color, role);
  }
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

function parseAppModeSpec(value: unknown, context: string): AppModeSpec {
  if (!isRecord(value)) throw new Error(`${context} must be an object.`);
  const seeds = parseAppSeeds(value.seeds);
  const overrides = parseAppOverrides(value.overrides);
  const panelOpacity = value.panelOpacity;
  if (panelOpacity !== undefined && (typeof panelOpacity !== "number" || !Number.isFinite(panelOpacity) || panelOpacity < 0 || panelOpacity > 1)) {
    throw new Error("panelOpacity must be a number between 0 and 1.");
  }
  return {
    seeds,
    ...(overrides ? { overrides } : {}),
    ...(panelOpacity !== undefined ? { panelOpacity } : {}),
  };
}

function parseCollectionField(value: unknown) {
  const collection = parseThemeCollection(value);
  if (value !== undefined && !collection) {
    throw new Error("Theme collections need a valid id and label.");
  }
  return collection;
}

export function parseThemeFile(value: unknown): ThemeDefinition {
  if (!isRecord(value)) {
    throw new Error("Theme files must contain a JSON object.");
  }
  if (value.version !== THEME_FILE_VERSION) {
    throw new Error(
      `This theme file uses an unsupported version. Expected ${THEME_FILE_VERSION}.`,
    );
  }
  const name = value.name;
  const appearance = value.appearance;
  if (!isThemeAppearance(appearance)) {
    throw new Error('Theme files need an appearance of "light" or "dark".');
  }
  if (!isThemeLabel(name)) throw new Error("Theme files need a name (48 characters or fewer).");

  if (value.id !== undefined && typeof value.id !== "string") throw new Error("Theme ids must be strings.");
  const { id } = themeFileIdentity(name, typeof value.id === "string" ? value.id : undefined);
  const collection = parseCollectionField(value.collection);

  const modes: Partial<Record<ThemeAppearance, AppModeSpec>> = {
    [appearance]: parseAppModeSpec(value, "Theme files"),
  };
  if (value.variants !== undefined) {
    if (!isRecord(value.variants)) throw new Error("Theme variants must be an object.");
    for (const [variantAppearance, raw] of Object.entries(value.variants)) {
      if (!isThemeAppearance(variantAppearance)) {
        throw new Error('Theme variants may only be named "light" or "dark".');
      }
      if (variantAppearance === appearance) {
        throw new Error(`Theme variants must not repeat the base appearance "${appearance}".`);
      }
      modes[variantAppearance] = parseAppModeSpec(raw, "Theme variants");
    }
  }

  return createThemeDefinition({
    id,
    label: name,
    appearance,
    modes,
    ...(collection ? { collection } : {}),
    managed: value.managed === true,
  });
}

/** The stored row a theme is written as — always the current file shape. */
export function serializeThemeRecord(theme: ThemeDefinition): Record<string, unknown> {
  const base = theme.modes[theme.appearance];
  if (!base) {
    throw new Error(`Theme "${theme.label}" is missing its base mode.`);
  }
  const variants: Record<string, unknown> = {};
  for (const mode of ["light", "dark"] as const) {
    if (mode === theme.appearance) continue;
    const spec = theme.modes[mode];
    if (!spec) continue;
    variants[mode] = {
      seeds: spec.seeds,
      ...(spec.overrides ? { overrides: spec.overrides } : {}),
      ...(spec.panelOpacity !== undefined ? { panelOpacity: spec.panelOpacity } : {}),
    };
  }
  return {
    version: THEME_FILE_VERSION,
    id: theme.id,
    name: theme.label,
    appearance: theme.appearance,
    seeds: base.seeds,
    ...(base.overrides ? { overrides: base.overrides } : {}),
    ...(base.panelOpacity !== undefined ? { panelOpacity: base.panelOpacity } : {}),
    ...(Object.keys(variants).length > 0 ? { variants } : {}),
    ...(theme.collection ? { collection: theme.collection } : {}),
    ...(theme.managed ? { managed: true } : {}),
  };
}

export function serializeThemeFile(theme: ThemeDefinition): string {
  return `${JSON.stringify(serializeThemeRecord(theme), null, 2)}\n`;
}
