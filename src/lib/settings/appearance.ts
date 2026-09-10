import {
  normalizeAppearanceSettings,
  type AppearancePreset,
  type AppearanceSettings,
} from "../theme/appearance";
import { parseStoredHalves } from "../theme/apply";
import {
  isKnownThemePreference,
  type ThemeHalves,
  type ThemePreference,
  type ThemePreferenceMode,
} from "../theme/palette";
import { settingsStore } from "./store";
import {
  getAppearanceMode,
  getThemeHalves,
  getThemePreference,
  setAppearanceMode,
  setThemeHalves,
  setThemePreference,
} from "./theme";

export const APPEARANCE_QUERY_KEY = ["settings", "appearance"] as const;

export async function getAppearanceSettings(): Promise<AppearanceSettings> {
  const stored = (await settingsStore.get<Partial<AppearanceSettings>>("appearance")) ?? {};
  return normalizeAppearanceSettings(stored);
}

export async function setAppearanceSettings(
  patch: Partial<AppearanceSettings>,
): Promise<AppearanceSettings> {
  const next = normalizeAppearanceSettings({ ...(await getAppearanceSettings()), ...patch });
  await settingsStore.set("appearance", next);
  await settingsStore.save();
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
  return parseAppearancePresets(await settingsStore.get("appearancePresets"));
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
  await settingsStore.set("appearancePresets", updated);
  await settingsStore.save();
  return next;
}

export async function deleteAppearancePreset(id: string): Promise<void> {
  const presets = await getAppearancePresets();
  await settingsStore.set(
    "appearancePresets",
    presets.filter((preset) => preset.id !== id),
  );
  await settingsStore.save();
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
