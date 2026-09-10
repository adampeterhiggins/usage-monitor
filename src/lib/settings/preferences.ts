import { DEFAULT_REFRESH_SHORTCUT, DEFAULT_TOGGLE_SHORTCUT } from "../shortcut";
import type { Layout } from "../usage-types";
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

export async function getLayout(): Promise<Layout> {
  return (await settingsStore.get<Layout>("layout")) ?? "wall";
}

export async function setLayout(layout: Layout): Promise<void> {
  await settingsStore.set("layout", layout);
  await settingsStore.save();
}
