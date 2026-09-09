import { LazyStore } from "@tauri-apps/plugin-store";
import { Command } from "@tauri-apps/plugin-shell";
import { emit } from "@tauri-apps/api/event";
import {
  normalizeAppearanceSettings,
  type AppearancePreset,
  type AppearanceSettings,
} from "./theme/appearance";
import {
  applyAppearanceChrome,
  applyUsageMonitorTheme,
  parseStoredHalves,
  systemPrefersDark,
} from "./theme/apply";
import {
  CUSTOM_THEMES_STORAGE_KEY,
  getCustomThemes,
  installCustomTheme,
  invalidateCustomThemes,
  isKnownThemePreference,
  removeCustomTheme,
  removeCustomThemes,
  replaceCustomThemeCollection,
  type ThemeDefinition,
  type ThemeHalves,
  type ThemePreference,
  type ThemePreferenceMode,
} from "./theme/palette";
import { APPEARANCE_CHANGED_EVENT } from "./appearance-window";
import { DEFAULT_REFRESH_SHORTCUT, DEFAULT_TOGGLE_SHORTCUT } from "./shortcut";
import type { Layout } from "./usage-types";

const store = new LazyStore("settings.json");

export const REFRESH_SHORTCUT_QUERY_KEY = ["settings", "refreshShortcut"] as const;
export const THEME_QUERY_KEY = ["settings", "theme"] as const;
export const APPEARANCE_QUERY_KEY = ["settings", "appearance"] as const;

/** @deprecated Prefer ThemePreference — kept for call sites that only use Auto/Light/Dark. */
export type ThemeSource = "system" | "light" | "dark";

const GH_SCOPE_NAMES = [
  "gh-token-homebrew-arm",
  "gh-token-homebrew-intel",
  "gh-token-path",
] as const;

export async function getToggleShortcut(): Promise<string> {
  return (await store.get<string>("toggleShortcut")) ?? DEFAULT_TOGGLE_SHORTCUT;
}

export async function setToggleShortcut(accelerator: string): Promise<void> {
  await store.set("toggleShortcut", accelerator);
  await store.save();
}

export async function getRefreshShortcut(): Promise<string> {
  return (await store.get<string>("refreshShortcut")) ?? DEFAULT_REFRESH_SHORTCUT;
}

export async function setRefreshShortcut(accelerator: string): Promise<string> {
  await store.set("refreshShortcut", accelerator);
  await store.save();
  return accelerator;
}

export async function getLayout(): Promise<Layout> {
  return (await store.get<Layout>("layout")) ?? "wall";
}

export async function setLayout(layout: Layout): Promise<void> {
  await store.set("layout", layout);
  await store.save();
}

export async function getThemePreference(): Promise<ThemePreference> {
  const theme = (await store.get<string>("theme")) ?? "light";
  return isKnownThemePreference(theme) ? theme : "light";
}

/** @deprecated Use getThemePreference */
export async function getTheme(): Promise<ThemeSource> {
  const theme = await getThemePreference();
  return theme === "system" || theme === "light" || theme === "dark" ? theme : "light";
}

export async function setThemePreference(theme: ThemePreference): Promise<void> {
  await store.set("theme", theme);
  await store.save();
}

/** @deprecated Use setThemePreference */
export async function setTheme(theme: ThemeSource): Promise<void> {
  await setThemePreference(theme);
}

export async function getAppearanceMode(): Promise<ThemePreferenceMode> {
  const mode = await store.get<ThemePreferenceMode>("appearanceMode");
  return mode === "light" || mode === "dark" || mode === "system" ? mode : "system";
}

export async function setAppearanceMode(mode: ThemePreferenceMode): Promise<void> {
  await store.set("appearanceMode", mode);
  await store.save();
}

export async function getThemeHalves(): Promise<ThemeHalves | null> {
  return parseStoredHalves(await store.get("themeHalves"));
}

export async function setThemeHalves(halves: ThemeHalves | null): Promise<void> {
  if (halves === null) await store.delete("themeHalves");
  else await store.set("themeHalves", halves);
  await store.save();
}

export async function getAppearanceSettings(): Promise<AppearanceSettings> {
  const stored = (await store.get<Partial<AppearanceSettings>>("appearance")) ?? {};
  return normalizeAppearanceSettings(stored);
}

export async function setAppearanceSettings(
  patch: Partial<AppearanceSettings>,
): Promise<AppearanceSettings> {
  const next = normalizeAppearanceSettings({ ...(await getAppearanceSettings()), ...patch });
  await store.set("appearance", next);
  await store.save();
  return next;
}

function parseAppearancePresets(raw: unknown): AppearancePreset[] {
  if (!Array.isArray(raw)) return [];
  const presets: AppearancePreset[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || typeof record.name !== "string") continue;
    const name = record.name.trim();
    if (!name) continue;
    const mode =
      record.mode === "light" || record.mode === "dark" || record.mode === "system"
        ? record.mode
        : undefined;
    const halves =
      record.halves === null
        ? null
        : record.halves && typeof record.halves === "object"
          ? parseStoredHalves(record.halves)
          : undefined;
    presets.push({
      id: record.id,
      name,
      settings: normalizeAppearanceSettings(
        record.settings && typeof record.settings === "object"
          ? (record.settings as Partial<AppearanceSettings>)
          : undefined,
      ),
      theme: typeof record.theme === "string" ? record.theme : undefined,
      mode,
      halves,
      updatedAt: typeof record.updatedAt === "number" ? record.updatedAt : Date.now(),
    });
  }
  return presets.sort((left, right) => right.updatedAt - left.updatedAt);
}

export async function getAppearancePresets(): Promise<AppearancePreset[]> {
  return parseAppearancePresets(await store.get("appearancePresets"));
}

function newPresetId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `preset-${crypto.randomUUID()}`;
  }
  return `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function saveAppearancePreset(input: {
  name: string;
  settings: AppearanceSettings;
  theme: ThemePreference;
  mode: ThemePreferenceMode;
  halves: ThemeHalves | null;
}): Promise<AppearancePreset> {
  const trimmed = input.name.trim();
  if (!trimmed) throw new Error("Name is required");
  const presets = await getAppearancePresets();
  const existing = presets.find(
    (preset) => preset.name.toLowerCase() === trimmed.toLowerCase(),
  );
  const next: AppearancePreset = {
    id: existing?.id ?? newPresetId(),
    name: trimmed,
    settings: normalizeAppearanceSettings(input.settings),
    theme: input.theme,
    mode: input.mode,
    halves: input.halves,
    updatedAt: Date.now(),
  };
  const updated = existing
    ? presets.map((preset) => (preset.id === existing.id ? next : preset))
    : [next, ...presets];
  await store.set("appearancePresets", updated);
  await store.save();
  return next;
}

export async function deleteAppearancePreset(id: string): Promise<void> {
  const presets = await getAppearancePresets();
  await store.set(
    "appearancePresets",
    presets.filter((preset) => preset.id !== id),
  );
  await store.save();
}

export async function applyAppearancePreset(id: string): Promise<{
  settings: AppearanceSettings;
  theme: ThemePreference;
  mode: ThemePreferenceMode;
  halves: ThemeHalves | null;
}> {
  const preset = (await getAppearancePresets()).find((item) => item.id === id);
  if (!preset) throw new Error("Preset not found");
  const settings = await setAppearanceSettings(preset.settings);
  const theme =
    preset.theme && isKnownThemePreference(preset.theme)
      ? preset.theme
      : await getThemePreference();
  const mode =
    preset.mode === "light" || preset.mode === "dark" || preset.mode === "system"
      ? preset.mode
      : await getAppearanceMode();
  const halves = preset.halves === undefined ? await getThemeHalves() : preset.halves;
  if (preset.theme !== undefined) await setThemePreference(theme);
  if (preset.mode !== undefined) await setAppearanceMode(mode);
  if (preset.halves !== undefined) await setThemeHalves(halves);
  return { settings, theme, mode, halves };
}

export async function loadCustomThemesIntoMemory(): Promise<void> {
  const stored = (await store.get<unknown[]>("customThemes")) ?? [];
  try {
    window.localStorage.setItem(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // localStorage may be unavailable in some webview modes.
  }
  invalidateCustomThemes();
}

export async function persistCustomThemesFromMemory(): Promise<void> {
  const themes = getCustomThemes();
  await store.set("customThemes", themes);
  await store.save();
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

export type GithubAuthSource = "oauth" | "pat" | "gh";

export interface GithubAuth {
  source: GithubAuthSource;
  login?: string;
}

export async function getGithubOAuthClientId(): Promise<string | null> {
  return (await store.get<string>("githubOAuthClientId")) ?? null;
}

export async function setGithubOAuthClientId(clientId: string): Promise<void> {
  const trimmed = clientId.trim();
  if (trimmed) await store.set("githubOAuthClientId", trimmed);
  else await store.delete("githubOAuthClientId");
  await store.save();
}

export async function getGithubToken(): Promise<string | null> {
  return (await store.get<string>("githubToken")) ?? null;
}

export async function getGithubAuth(): Promise<GithubAuth | null> {
  const token = await getGithubToken();
  if (!token) return null;
  const stored = await store.get<GithubAuth>("githubAuth");
  if (stored?.source === "oauth" || stored?.source === "pat" || stored?.source === "gh") {
    return stored;
  }
  return { source: "pat" };
}

export async function saveGithubCredentials(token: string, auth: GithubAuth): Promise<void> {
  await store.set("githubToken", token.trim());
  await store.set("githubAuth", auth);
  await store.save();
}

export async function clearGithubCredentials(): Promise<void> {
  await store.delete("githubToken");
  await store.delete("githubAuth");
  await store.save();
}

export async function setGithubToken(token: string): Promise<void> {
  await saveGithubCredentials(token, { source: "pat" });
}

export async function clearGithubToken(): Promise<void> {
  await clearGithubCredentials();
}

export async function importTokenFromGhCli(): Promise<string | null> {
  for (const name of GH_SCOPE_NAMES) {
    try {
      const out = await Command.create(name, ["auth", "token"]).execute();
      const token = out.stdout.trim();
      if (out.code === 0 && token) return token;
    } catch {
      // This candidate path does not exist; try the next.
    }
  }
  return null;
}

/** Apply theme preference to the document (classic Auto/Light/Dark or palette). */
export function applyTheme(theme: ThemePreference): void {
  applyUsageMonitorTheme(theme, { systemDark: systemPrefersDark() });
}

export async function refreshAppliedAppearance(): Promise<void> {
  await loadCustomThemesIntoMemory();
  const [theme, appearanceMode, halves, appearance] = await Promise.all([
    getThemePreference(),
    getAppearanceMode(),
    getThemeHalves(),
    getAppearanceSettings(),
  ]);
  applyUsageMonitorTheme(theme, {
    appearanceMode,
    halves,
    systemDark: systemPrefersDark(),
  });
  applyAppearanceChrome(appearance);
}

/** Apply locally, then notify other windows (e.g. main panel ↔ Appearance). */
export async function refreshAppliedAppearanceAndBroadcast(): Promise<void> {
  await refreshAppliedAppearance();
  await emit(APPEARANCE_CHANGED_EVENT, null);
}
