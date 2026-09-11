import type { ProviderId } from "../../contracts/providers";
import { CURSOR_IDE_SELECTOR } from "../../contracts/auth";
import {
  cursorIdeLoginMeta as readCursorIdeLoginMeta,
  listKeychainAccounts,
  readKeychainPassword,
  type CursorIdeLogin,
  type KeychainEntry,
} from "../../platform/credentials";

/** Keychain service name Claude Code stores its OAuth login under. */
export const CLAUDE_CODE_KEYCHAIN_SERVICE = "Claude Code-credentials";
/** Keychain service name the Codex CLI uses when `cli_auth_credentials_store = "keyring"`. */
export const CODEX_KEYCHAIN_SERVICE = "Codex Auth";
/** Keychain service name `cursor-agent` stores its session JWT under. */
export const CURSOR_ACCESS_TOKEN_SERVICE = "cursor-access-token";
/** Stored `extra` value pinning a Cursor account to the desktop app's `state.vscdb` login. */
export const CURSOR_IDE_PIN = CURSOR_IDE_SELECTOR;

export type { CursorIdeLogin, KeychainEntry } from "../../platform/credentials";

export interface KeychainLogin {
  service: string;
  /** Human name for one entry, e.g. "Claude Code login". */
  noun: string;
}

/** Providers whose native mode reads a CLI login from the macOS Keychain. */
export const KEYCHAIN_LOGINS: Partial<Record<ProviderId, KeychainLogin>> = {
  claude: { service: CLAUDE_CODE_KEYCHAIN_SERVICE, noun: "Claude Code login" },
  codex: { service: CODEX_KEYCHAIN_SERVICE, noun: "Codex CLI login" },
  cursor: { service: CURSOR_ACCESS_TOKEN_SERVICE, noun: "cursor-agent login" },
};

/** Picker metadata for the Cursor IDE login. Does not read the access token. */
export async function cursorIdeLoginMeta(): Promise<CursorIdeLogin | null> {
  try {
    return await readCursorIdeLoginMeta();
  } catch {
    return null;
  }
}

/** Parse a `YYYYMMDDHHMMSSZ` Keychain stamp into epoch ms. */
export function keychainStampToMs(stamp?: string | null): number | undefined {
  const m = stamp?.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/);
  if (!m) return undefined;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  return Date.UTC(y, mo - 1, d, h, mi, s);
}

export function describeKeychainEntry(entry: KeychainEntry): string {
  const ms = keychainStampToMs(entry.modified);
  if (ms === undefined) return entry.account;
  const when = new Date(ms).toLocaleString([], {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${entry.account} · updated ${when}`;
}

export interface ResolvedKeychainCredential<T> {
  value: T;
  /** Keychain account the value came from, when it matters (pinned, or several existed). */
  source?: string;
}

/**
 * Resolve a CLI login from the Keychain.
 *
 * With `account` set, read exactly that entry. Otherwise try every entry under
 * the service newest-first and use the first one `parse` accepts. `security`
 * alone returns an arbitrary match, which breaks when a stray entry without a
 * token sits alongside the real login.
 *
 * `parse` receives the raw secret plus a description of where it came from,
 * and must throw a descriptive error when the secret is unusable.
 *
 * Returns `null` only when nothing under the service exists at all, so callers
 * can fall back to a file. Unusable entries throw instead.
 */
export async function resolveKeychainCredential<T>(
  login: KeychainLogin,
  account: string | undefined,
  parse: (raw: string, describe: string) => T,
): Promise<ResolvedKeychainCredential<T> | null> {
  if (account) {
    let raw: string;
    try {
      raw = await readKeychainPassword(login.service, account);
    } catch {
      throw new Error(
        `${login.noun} "${account}" no longer exists in the Keychain. Edit this account and pick another.`,
      );
    }
    return { value: parse(raw, `${login.noun} "${account}"`), source: account };
  }

  let entries: KeychainEntry[] = [];
  try {
    entries = await listKeychainAccounts(login.service);
  } catch {
    entries = [];
  }

  let firstError: Error | undefined;
  for (const entry of entries) {
    try {
      const raw = await readKeychainPassword(login.service, entry.account);
      const value = parse(raw, `${login.noun} "${entry.account}"`);
      return { value, source: entries.length > 1 ? entry.account : undefined };
    } catch (e) {
      firstError ??= e instanceof Error ? e : new Error(String(e));
    }
  }
  if (entries.length > 0 && firstError) {
    throw new Error(
      `${entries.length} ${login.noun}s found in the Keychain but none is usable. ${firstError.message}`,
    );
  }

  // Listing failed or found nothing — fall back to whatever `security` returns.
  let raw: string;
  try {
    raw = await readKeychainPassword(login.service);
  } catch {
    return null;
  }
  return { value: parse(raw, login.noun) };
}
