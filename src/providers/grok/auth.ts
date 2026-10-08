import { decodeJwtPayload } from "../shared/loginSession";

/** The Grok CLI keeps its login here as JSON — not in the Keychain. */
export const GROK_AUTH_PATH = ".grok/auth.json";

/**
 * The CLI's `auth.json` can hold logins for several deployments. Only the
 * grok.com ones are read, mirroring T3 Code: picking an arbitrary entry could
 * report another deployment's account as this one.
 */
const GROK_COM_ENTRIES = [
  "https://auth.x.ai::b1a00492-073a-47ea-816f-4c329264a828",
  "https://accounts.x.ai/sign-in",
] as const;

interface GrokAuthEntry {
  key?: unknown;
  auth_mode?: unknown;
  email?: unknown;
}

export interface GrokCredential {
  token: string;
  email?: string;
}

function string(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Pull the grok.com login out of the CLI's `auth.json`. */
export function parseGrokAuthJson(raw: string, describe: string): GrokCredential {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`${describe} is not valid JSON.`);
  }
  const entries = (data ?? {}) as Record<string, GrokAuthEntry | undefined>;
  const entry = GROK_COM_ENTRIES.map((key) => entries[key]).find(Boolean);
  if (!entry) throw new Error(`${describe} has no grok.com login. Run \`grok login\`.`);
  // API keys bill per token through console.x.ai and have no subscription quota.
  if (entry.auth_mode === "api_key") {
    throw new Error(`${describe} is an xAI API key login, which has no subscription usage to read.`);
  }
  const token = string(entry.key);
  if (!token) throw new Error(`${describe} has no access token. Run \`grok login\`.`);
  return { token, email: string(entry.email) };
}

/** Accept either a bare access token or the whole `auth.json` file. */
export function grokCredential(raw: string, describe: string): GrokCredential {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error(`${describe} is empty.`);
  if (trimmed.startsWith("{")) return parseGrokAuthJson(trimmed, describe);
  if (/\s/.test(trimmed)) throw new Error(`${describe} is not a Grok access token or auth.json file.`);
  return { token: trimmed };
}

/** Whether the token's own `exp` has passed. The CLI refreshes it on use, so
 *  an idle CLI leaves an expired token behind. Unknown expiry reads as live. */
export function grokTokenExpired(token: string, now = Date.now()): boolean {
  const exp = decodeJwtPayload(token)?.exp;
  return typeof exp === "number" && exp * 1000 <= now;
}
