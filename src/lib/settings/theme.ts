import { parseStoredHalves } from "../theme/apply";
import type { ThemeHalves } from "../theme/halves";
import { isKnownThemePreference } from "../theme/registry";
import type { ThemePreference, ThemePreferenceMode } from "../theme/types";
import { settingsStore } from "./store";

export const THEME_QUERY_KEY = ["settings", "theme"] as const;

export async function getThemePreference(): Promise<ThemePreference> {
  const theme = (await settingsStore.get<string>("theme")) ?? "light";
  return isKnownThemePreference(theme) ? theme : "light";
}

export async function setThemePreference(theme: ThemePreference): Promise<void> {
  await settingsStore.set("theme", theme);
  await settingsStore.save();
}

export async function getAppearanceMode(): Promise<ThemePreferenceMode> {
  const mode = await settingsStore.get<ThemePreferenceMode>("appearanceMode");
  return mode === "light" || mode === "dark" || mode === "system" ? mode : "system";
}

export async function setAppearanceMode(mode: ThemePreferenceMode): Promise<void> {
  await settingsStore.set("appearanceMode", mode);
  await settingsStore.save();
}

export async function getThemeHalves(): Promise<ThemeHalves | null> {
  return parseStoredHalves(await settingsStore.get("themeHalves"));
}

export async function setThemeHalves(halves: ThemeHalves | null): Promise<void> {
  if (halves === null) await settingsStore.delete("themeHalves");
  else await settingsStore.set("themeHalves", halves);
  await settingsStore.save();
}
