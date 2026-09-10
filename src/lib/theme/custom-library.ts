import {
  canonicalizeThemeDefinition,
  getDefaultThemeColors,
} from "./derive";
import { isThemeColor, toCanonicalThemeColor } from "./colors";
import {
  isRecord,
  isThemeAppearance,
  isThemeId,
  isThemeLabel,
  parseThemeCollection,
  RESERVED_THEME_IDS,
  THEME_COLOR_ROLE_SET,
  type ThemeAppearance,
  type ThemeColorRole,
  type ThemeColors,
  type ThemeDefinition,
  type ThemeVariants,
} from "./types";
import { BUILT_IN_THEMES } from "./themePalettes";

function parseStoredThemeColors(value: unknown, appearance: ThemeAppearance): ThemeColors | null {
  if (!isRecord(value)) return null;

  const colors: Partial<Record<ThemeColorRole, string>> = {
    ...getDefaultThemeColors(appearance),
  };
  // Tolerate unknown roles and malformed values so themes saved by other
  // builds (for example one that adds a new role) keep their remaining colors.
  for (const [role, color] of Object.entries(value)) {
    const normalized = toCanonicalThemeColor(color);
    if (THEME_COLOR_ROLE_SET.has(role) && normalized) {
      colors[role as ThemeColorRole] = normalized;
    }
  }
  // Themes saved before `menu` existed used `surface` for both cards and
  // settings chrome. Keep that pairing unless the file set menu itself.
  if (!isThemeColor(value.menu) && colors.surface) {
    colors.menu = colors.surface;
  }
  return colors as ThemeColors;
}

function parseStoredThemeVariants(
  value: unknown,
  baseAppearance: ThemeAppearance,
): ThemeVariants | null | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;

  const variants: Partial<Record<ThemeAppearance, ThemeColors>> = {};
  for (const [appearance, colors] of Object.entries(value)) {
    if (!isThemeAppearance(appearance)) return null;
    // A variant matching the base appearance would be shadowed by the base
    // colors; drop it so the theme round-trips through parseThemeFile.
    if (appearance === baseAppearance) continue;
    const parsedColors = parseStoredThemeColors(colors, appearance);
    if (!parsedColors) return null;
    variants[appearance] = parsedColors;
  }
  return Object.keys(variants).length > 0 ? variants : undefined;
}

function parseStoredTheme(value: unknown): ThemeDefinition | null {
  if (!isRecord(value)) return null;
  if (!isThemeId(value.id) || RESERVED_THEME_IDS.has(value.id)) return null;
  if (!isThemeLabel(value.label) || !isThemeAppearance(value.appearance)) return null;
  const colors = parseStoredThemeColors(value.colors, value.appearance);
  if (!colors) return null;
  const variants = parseStoredThemeVariants(value.variants, value.appearance);
  if (value.variants !== undefined && variants === null) return null;
  const collection = parseThemeCollection(value.collection);

  return {
    id: value.id,
    label: value.label.trim(),
    appearance: value.appearance,
    colors,
    ...(variants ? { variants } : {}),
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
  const canonicalTheme = canonicalizeThemeDefinition(theme);
  const themes = [...library.themes, canonicalTheme];
  setCustomThemeLibrary([...library.storedThemes, canonicalTheme], themes);
  return canonicalTheme;
}

export function replaceCustomThemeCollection(
  collectionId: string,
  themes: ReadonlyArray<ThemeDefinition>,
  options?: { expectedCollection?: ReadonlyArray<ThemeDefinition> },
): ReadonlyArray<ThemeDefinition> {
  if (themes.length === 0) throw new Error("A theme collection cannot be empty.");

  const validated = themes.map((theme) => parseStoredTheme(theme));
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
      nextStoredThemes.push(...replacement);
      insertedReplacement = true;
    }
  }
  if (!insertedReplacement) nextStoredThemes.push(...replacement);

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
