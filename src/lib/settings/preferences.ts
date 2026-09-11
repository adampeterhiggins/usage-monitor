import { DEFAULT_REFRESH_SHORTCUT, DEFAULT_TOGGLE_SHORTCUT } from "./shortcuts";
import { settingsStore } from "./store";

export const REFRESH_SHORTCUT_QUERY_KEY = ["settings", "refreshShortcut"] as const;

export async function getToggleShortcut(): Promise<string> {
  return (await settingsStore.get<string>("toggleShortcut")) ?? DEFAULT_TOGGLE_SHORTCUT;
}

export async function setToggleShortcut(accelerator: string): Promise<void> {
  await settingsStore.set("toggleShortcut", accelerator);
  await settingsStore.save();
}

export async function getRefreshShortcut(): Promise<string> {
  return (await settingsStore.get<string>("refreshShortcut")) ?? DEFAULT_REFRESH_SHORTCUT;
}

export async function setRefreshShortcut(accelerator: string): Promise<string> {
  await settingsStore.set("refreshShortcut", accelerator);
  await settingsStore.save();
  return accelerator;
}

