import {
  customThemesStorageSnapshot,
  hydrateCustomThemeLibrary,
  installCustomTheme,
  removeCustomTheme,
  removeCustomThemes,
  replaceCustomThemeCollection,
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

export async function installAndPersistTheme(theme: ThemeDefinition): Promise<ThemeDefinition> {
  await loadCustomThemesIntoMemory();
  const installed = installCustomTheme(theme);
  await persistCustomThemesFromMemory();
  return installed;
}

export async function replaceAndPersistThemeCollection(
  collectionId: string,
  themes: ReadonlyArray<ThemeDefinition>,
): Promise<ReadonlyArray<ThemeDefinition>> {
  await loadCustomThemesIntoMemory();
  const installed = replaceCustomThemeCollection(collectionId, themes);
  await persistCustomThemesFromMemory();
  return installed;
}

export async function removeAndPersistTheme(themeId: string): Promise<void> {
  await loadCustomThemesIntoMemory();
  removeCustomTheme(themeId);
  await persistCustomThemesFromMemory();
}

export async function removeAndPersistThemes(themeIds: ReadonlyArray<string>): Promise<void> {
  await loadCustomThemesIntoMemory();
  removeCustomThemes(themeIds);
  await persistCustomThemesFromMemory();
}
