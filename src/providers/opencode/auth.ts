/** OpenCode keeps provider logins here as JSON — not in the Keychain. */
export const OPENCODE_AUTH_PATH = ".local/share/opencode/auth.json";

/** Pull the OpenCode Go key out of OpenCode's `auth.json`. */
export function parseOpenCodeAuthJson(raw: string, describe: string): string {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`${describe} is not valid JSON.`);
  }
  const entry = (data as Record<string, { type?: unknown; key?: unknown } | undefined> | null)?.[
    "opencode-go"
  ];
  const key = entry?.type === "api" && typeof entry.key === "string" ? entry.key.trim() : "";
  if (!key) {
    throw new Error(`${describe} has no OpenCode Go key. Run \`opencode auth login\` and pick OpenCode Go.`);
  }
  return key;
}

/** Accept either a bare API key or the whole `auth.json` file. */
export function openCodeApiKey(raw: string, describe: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error(`${describe} is empty.`);
  if (trimmed.startsWith("{")) return parseOpenCodeAuthJson(trimmed, describe);
  if (/\s/.test(trimmed)) throw new Error(`${describe} is not an OpenCode API key or auth.json file.`);
  return trimmed;
}
