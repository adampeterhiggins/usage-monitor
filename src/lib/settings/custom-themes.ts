import {
  customThemesStorageSnapshot,
  hydrateCustomThemeLibrary,
  installCustomTheme,
  removeCustomTheme,
  removeCustomThemes,
  replaceCustomThemeCollection,
  updateCustomTheme,
} from "../theme/custom-library";
import type { ThemeDefinition } from "../theme/types";
import { settingsStore } from "./store";

const CUSTOM_THEMES_KEY = "customThemes";

export async function loadCustomThemesIntoMemory(): Promise<void> {
  hydrateCustomThemeLibrary(await settingsStore.get<unknown[]>(CUSTOM_THEMES_KEY));
}

export async function persistCustomThemesFromMemory(): Promise<void> {
  await settingsStore.set(CUSTOM_THEMES_KEY, customThemesStorageSnapshot());
  await settingsStore.save();
}

// Serialize mutations so a failed save cannot roll back another local edit.
let pendingMutation: Promise<unknown> = Promise.resolve();
function mutateAndPersist<T>(mutate: () => T): Promise<T> {
  const operation = pendingMutation.then(async () => {
    const previous = await settingsStore.get<unknown>(CUSTOM_THEMES_KEY);
    hydrateCustomThemeLibrary(previous);
    try {
      const result = mutate();
      await persistCustomThemesFromMemory();
      return result;
    } catch (error) {
      hydrateCustomThemeLibrary(previous);
      // LazyStore also caches set() before save(): restore that cache as well.
      if (previous === undefined) await settingsStore.delete(CUSTOM_THEMES_KEY);
      else await settingsStore.set(CUSTOM_THEMES_KEY, previous);
      throw error;
    }
  });
  pendingMutation = operation.catch(() => undefined);
  return operation;
}

export function installAndPersistTheme(theme: ThemeDefinition): Promise<ThemeDefinition> {
  return mutateAndPersist(() => installCustomTheme(theme));
}

export function replaceAndPersistThemeCollection(
  collectionId: string,
  themes: ReadonlyArray<ThemeDefinition>,
): Promise<ReadonlyArray<ThemeDefinition>> {
  return mutateAndPersist(() => replaceCustomThemeCollection(collectionId, themes));
}

export function updateAndPersistTheme(themeId: string, replacement: ThemeDefinition): Promise<ThemeDefinition> {
  return mutateAndPersist(() => updateCustomTheme(themeId, replacement));
}

export function removeAndPersistTheme(themeId: string): Promise<void> {
  return mutateAndPersist(() => removeCustomTheme(themeId));
}

export function removeAndPersistThemes(themeIds: ReadonlyArray<string>): Promise<void> {
  return mutateAndPersist(() => removeCustomThemes(themeIds));
}
