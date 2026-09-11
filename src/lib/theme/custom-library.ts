/** The custom theme library: in-memory normalized themes plus the raw stored
 *  rows they came from.
 *
 *  Storage keeps every row verbatim — including rows with fields this build
 *  doesn't know — so forward compatibility is preserved. Parsing is
 *  permissive: unknown roles and malformed values are dropped rather than
 *  failing the row. Rows that don't parse are preserved on disk but hidden
 *  from the library. */

import { toCanonicalThemeColor } from "./colors";
import { serializeThemeRecord } from "./theme-file";
import {
  APP_OVERRIDE_ROLE_SET,
  type AppModeSpec,
  type AppOverrideRole,
} from "./source-types";
import {
  isRecord,
  isThemeAppearance,
  isThemeId,
  isThemeLabel,
  parseThemeCollection,
  RESERVED_THEME_IDS,
  type ThemeAppearance,
  type ThemeDefinition,
} from "./types";
import { BUILT_IN_THEMES } from "./themePalettes";

// ---------------------------------------------------------------------------
// Permissive stored-row parsing

function parseStoredSeeds(value: unknown): AppModeSpec["seeds"] | null {
  if (!isRecord(value)) return null;
  const canvas = toCanonicalThemeColor(value.canvas);
  const accent = toCanonicalThemeColor(value.accent);
  return canvas && accent ? { canvas, accent } : null;
}

function parseStoredOverrides(value: unknown): AppModeSpec["overrides"] {
  if (!isRecord(value)) return undefined;
  const overrides: Partial<Record<AppOverrideRole, string>> = {};
  for (const [role, color] of Object.entries(value)) {
    const normalized = toCanonicalThemeColor(color);
    if (APP_OVERRIDE_ROLE_SET.has(role) && normalized) {
      overrides[role as AppOverrideRole] = normalized;
    }
  }
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

function parseStoredAppSpec(value: unknown): AppModeSpec | null {
  if (!isRecord(value)) return null;
  const seeds = parseStoredSeeds(value.seeds);
  if (!seeds) return null;
  const overrides = parseStoredOverrides(value.overrides);
  return overrides ? { seeds, overrides } : { seeds };
}

function parseStoredMode(
  row: Record<string, unknown>,
  mode: ThemeAppearance,
): AppModeSpec | null {
  if (row.version !== 2) return null;
  const raw = mode === (row.appearance as string)
    ? row
    : (row.variants as Record<string, unknown> | undefined)?.[mode];
  return raw ? parseStoredAppSpec(raw) : null;
}

function parseStoredTheme(value: unknown): ThemeDefinition | null {
  if (!isRecord(value)) return null;
  if (!isThemeId(value.id) || RESERVED_THEME_IDS.has(value.id)) return null;
  const label = value.label ?? value.name;
  if (!isThemeLabel(label) || !isThemeAppearance(value.appearance)) return null;
  const appearance = value.appearance;

  const modes: Partial<Record<ThemeAppearance, AppModeSpec>> = {};
  const base = parseStoredMode(value, appearance);
  if (!base) return null;
  modes[appearance] = base;
  const other: ThemeAppearance = appearance === "light" ? "dark" : "light";
  const otherMode = parseStoredMode(value, other);
  if (otherMode) modes[other] = otherMode;

  const collection = parseThemeCollection(value.collection);
  return {
    id: value.id,
    label: label.trim(),
    appearance,
    modes,
    ...(collection ? { collection } : {}),
    ...(value.managed === true ? { managed: true } : {}),
  };
}

function parseStoredThemes(storedThemes: ReadonlyArray<unknown>): ReadonlyArray<ThemeDefinition> {
  const themes: ThemeDefinition[] = [];
  for (const value of storedThemes) {
    const theme = parseStoredTheme(value);
    if (theme && !themes.some((existing) => existing.id === theme.id)) {
      themes.push(theme);
    }
  }
  return themes;
}

interface CustomThemeLibrary {
  storedThemes: ReadonlyArray<unknown>;
  themes: ReadonlyArray<ThemeDefinition>;
  malformed: boolean;
}

let customThemeLibrary: CustomThemeLibrary | null = null;
const customThemeListeners = new Set<() => void>();

function notifyCustomThemeListeners() {
  for (const listener of customThemeListeners) listener();
}

/**
 * Replace the in-memory library with rows read from persistent storage.
 * Anything that is not an array is treated as malformed: reads degrade to an
 * empty library while writes refuse, so a corrupt store cannot be silently
 * overwritten.
 */
export function hydrateCustomThemeLibrary(stored: unknown): void {
  customThemeLibrary = Array.isArray(stored)
    ? { storedThemes: stored, themes: parseStoredThemes(stored), malformed: false }
    : { storedThemes: [], themes: [], malformed: stored !== undefined && stored !== null };
  notifyCustomThemeListeners();
}

export function invalidateCustomThemes() {
  customThemeLibrary = null;
  notifyCustomThemeListeners();
}

const EMPTY_LIBRARY: ReadonlyArray<never> = [];

export function getCustomThemes(): ReadonlyArray<ThemeDefinition> {
  // Stable reference before hydration — useSyncExternalStore compares snapshots.
  return customThemeLibrary?.themes ?? EMPTY_LIBRARY;
}

/** Raw stored rows (unknown fields preserved) for write-back to storage. */
export function customThemesStorageSnapshot(): ReadonlyArray<unknown> {
  return customThemeLibrary?.storedThemes ?? EMPTY_LIBRARY;
}

function requireCustomThemeLibrary(): CustomThemeLibrary {
  if (customThemeLibrary === null) {
    throw new Error("The theme library has not been loaded yet.");
  }
  if (customThemeLibrary.malformed) {
    throw new Error("The stored theme library is malformed; fix or remove it before editing themes.");
  }
  return customThemeLibrary;
}

export function subscribeToCustomThemes(listener: () => void): () => void {
  customThemeListeners.add(listener);
  return () => customThemeListeners.delete(listener);
}

function setCustomThemeLibrary(
  storedThemes: ReadonlyArray<unknown>,
  themes: ReadonlyArray<ThemeDefinition>,
): void {
  customThemeLibrary = { storedThemes, themes, malformed: false };
  notifyCustomThemeListeners();
}

function storedThemeHasId(storedTheme: unknown, themeId: string): boolean {
  return isRecord(storedTheme) && storedTheme.id === themeId;
}

function storedThemeHasCollectionId(storedTheme: unknown, collectionId: string): boolean {
  return (
    isRecord(storedTheme) &&
    isRecord(storedTheme.collection) &&
    storedTheme.collection.id === collectionId
  );
}

/** The row a theme is written as — a file-shaped record preserving format. */
function storedRowFor(theme: ThemeDefinition): Record<string, unknown> {
  const record = serializeThemeRecord(theme);
  // Stored rows historically used `label`; keep both readable.
  return { ...record, label: theme.label };
}

export function installCustomTheme(theme: ThemeDefinition): ThemeDefinition {
  if (RESERVED_THEME_IDS.has(theme.id)) {
    throw new Error(`The theme id "${theme.id}" is reserved.`);
  }
  const library = requireCustomThemeLibrary();
  if (
    BUILT_IN_THEMES.some((existing) => existing.id === theme.id) ||
    library.storedThemes.some((storedTheme) => storedThemeHasId(storedTheme, theme.id))
  ) {
    throw new Error(`A theme named "${theme.label}" is already installed.`);
  }
  const row = storedRowFor(theme);
  const themes = [...library.themes, theme];
  setCustomThemeLibrary([...library.storedThemes, row], themes);
  return theme;
}

/** Replace an installed theme in place. */
export function updateCustomTheme(themeId: string, replacement: ThemeDefinition): ThemeDefinition {
  const library = requireCustomThemeLibrary();
  const index = library.storedThemes.findIndex((row) => storedThemeHasId(row, themeId));
  if (index < 0) {
    throw new Error(`Theme "${themeId}" is not installed.`);
  }
  const next = { ...replacement, id: themeId };
  const row = storedRowFor(next);

  const nextStoredThemes = [...library.storedThemes];
  nextStoredThemes[index] = row;
  const nextThemes = library.themes.map((theme) => (theme.id === themeId ? next : theme));
  setCustomThemeLibrary(nextStoredThemes, nextThemes);
  return next;
}

export function replaceCustomThemeCollection(
  collectionId: string,
  themes: ReadonlyArray<ThemeDefinition>,
  options?: { expectedCollection?: ReadonlyArray<ThemeDefinition> },
): ReadonlyArray<ThemeDefinition> {
  if (themes.length === 0) throw new Error("A theme collection cannot be empty.");

  const validated = themes.map((theme) => parseStoredTheme(storedRowFor(theme)));
  if (
    validated.some((theme) => theme === null || theme.collection?.id !== collectionId) ||
    new Set(validated.map((theme) => theme?.id)).size !== validated.length
  ) {
    throw new Error("That theme collection is invalid.");
  }
  const replacement = validated as ThemeDefinition[];
  const library = requireCustomThemeLibrary();
  const current = library.themes;
  const currentCollection = current.filter((theme) => theme.collection?.id === collectionId);
  if (
    options?.expectedCollection &&
    JSON.stringify(currentCollection) !== JSON.stringify(options.expectedCollection)
  ) {
    throw new Error("Your installed themes changed while this package was downloading. Try again.");
  }
  const occupiedIds = new Set(BUILT_IN_THEMES.map((theme) => theme.id));
  for (const storedTheme of library.storedThemes) {
    if (
      !storedThemeHasCollectionId(storedTheme, collectionId) &&
      isRecord(storedTheme) &&
      typeof storedTheme.id === "string"
    ) {
      occupiedIds.add(storedTheme.id);
    }
  }
  const conflictingTheme = replacement.find(
    (theme) => RESERVED_THEME_IDS.has(theme.id) || occupiedIds.has(theme.id),
  );
  if (conflictingTheme) {
    throw new Error(`A theme named "${conflictingTheme.label}" is already installed.`);
  }

  const nextStoredThemes: unknown[] = [];
  let insertedReplacement = false;
  for (const storedTheme of library.storedThemes) {
    if (!storedThemeHasCollectionId(storedTheme, collectionId)) {
      nextStoredThemes.push(storedTheme);
    } else if (!insertedReplacement) {
      nextStoredThemes.push(...replacement.map(storedRowFor));
      insertedReplacement = true;
    }
  }
  if (!insertedReplacement) nextStoredThemes.push(...replacement.map(storedRowFor));

  setCustomThemeLibrary(nextStoredThemes, parseStoredThemes(nextStoredThemes));
  return replacement;
}

export function removeCustomTheme(themeId: string): void {
  removeCustomThemes([themeId]);
}

export function removeCustomThemes(themeIds: ReadonlyArray<string>): void {
  const removedIds = new Set(themeIds);
  if (removedIds.size === 0) return;
  const library = requireCustomThemeLibrary();
  const nextThemes = library.themes.filter((theme) => !removedIds.has(theme.id));
  if (nextThemes.length === library.themes.length) return;
  setCustomThemeLibrary(
    library.storedThemes.filter(
      (storedTheme) =>
        !isRecord(storedTheme) ||
        typeof storedTheme.id !== "string" ||
        !removedIds.has(storedTheme.id),
    ),
    nextThemes,
  );
}
