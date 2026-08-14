import { LazyStore } from "@tauri-apps/plugin-store";
import { Command } from "@tauri-apps/plugin-shell";
import { DEFAULT_REFRESH_SHORTCUT, DEFAULT_TOGGLE_SHORTCUT } from "./shortcut";
import type { Layout } from "./usage-types";

const store = new LazyStore("settings.json");

export const REFRESH_SHORTCUT_QUERY_KEY = ["settings", "refreshShortcut"] as const;

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

export async function getTheme(): Promise<ThemeSource> {
  return (await store.get<ThemeSource>("theme")) ?? "light";
}

export async function setTheme(theme: ThemeSource): Promise<void> {
  await store.set("theme", theme);
  await store.save();
}

export async function getGithubToken(): Promise<string | null> {
  return (await store.get<string>("githubToken")) ?? null;
}

export async function setGithubToken(token: string): Promise<void> {
  await store.set("githubToken", token.trim());
  await store.save();
}

export async function clearGithubToken(): Promise<void> {
  await store.delete("githubToken");
  await store.save();
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

export function applyTheme(theme: ThemeSource): void {
  const root = document.documentElement;
  if (theme === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
}
