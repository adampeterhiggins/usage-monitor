/** External actions — opening URLs in the user's browser and the one
 *  purpose-specific shell command the app allows (`gh auth token`). */

import { openUrl } from "@tauri-apps/plugin-opener";
import { Command } from "@tauri-apps/plugin-shell";

export async function openExternal(url: string): Promise<void> {
  await openUrl(url);
}

const GH_SCOPE_NAMES = [
  "gh-token-homebrew-arm",
  "gh-token-homebrew-intel",
  "gh-token-path",
] as const;

/** `gh auth token` through the allowlisted scope names, or null. */
export async function readGithubCliToken(): Promise<string | null> {
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
