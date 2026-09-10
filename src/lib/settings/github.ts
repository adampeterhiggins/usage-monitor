import { Command } from "@tauri-apps/plugin-shell";
import { settingsStore } from "./store";

const GH_SCOPE_NAMES = [
  "gh-token-homebrew-arm",
  "gh-token-homebrew-intel",
  "gh-token-path",
] as const;

export type GithubAuthSource = "oauth" | "pat" | "gh";

export interface GithubAuth {
  source: GithubAuthSource;
  login?: string;
}

export async function getGithubOAuthClientId(): Promise<string | null> {
  return (await settingsStore.get<string>("githubOAuthClientId")) ?? null;
}

export async function setGithubOAuthClientId(clientId: string): Promise<void> {
  const trimmed = clientId.trim();
  if (trimmed) await settingsStore.set("githubOAuthClientId", trimmed);
  else await settingsStore.delete("githubOAuthClientId");
  await settingsStore.save();
}

export async function getGithubToken(): Promise<string | null> {
  return (await settingsStore.get<string>("githubToken")) ?? null;
}

export async function getGithubAuth(): Promise<GithubAuth | null> {
  const token = await getGithubToken();
  if (!token) return null;
  const stored = await settingsStore.get<GithubAuth>("githubAuth");
  if (stored?.source === "oauth" || stored?.source === "pat" || stored?.source === "gh") {
    return stored;
  }
  return { source: "pat" };
}

export async function saveGithubCredentials(token: string, auth: GithubAuth): Promise<void> {
  await settingsStore.set("githubToken", token.trim());
  await settingsStore.set("githubAuth", auth);
  await settingsStore.save();
}

export async function clearGithubCredentials(): Promise<void> {
  await settingsStore.delete("githubToken");
  await settingsStore.delete("githubAuth");
  await settingsStore.save();
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
