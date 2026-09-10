import {
  CUSTOM_THEMES_STORAGE_KEY,
  getCustomThemes,
  installCustomTheme,
  invalidateCustomThemes,
  removeCustomTheme,
  removeCustomThemes,
  replaceCustomThemeCollection,
  type ThemeDefinition,
} from "../theme/palette";
import { settingsStore } from "./store";

export async function loadCustomThemesIntoMemory(): Promise<void> {
  const stored = (await settingsStore.get<unknown[]>("customThemes")) ?? [];
  try {
    window.localStorage.setItem(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // localStorage may be unavailable in some webview modes.
  }
  invalidateCustomThemes();
}

export async function persistCustomThemesFromMemory(): Promise<void> {
  const themes = getCustomThemes();
  await settingsStore.set("customThemes", themes);
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
