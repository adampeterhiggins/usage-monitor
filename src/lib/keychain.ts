import { invoke } from "@tauri-apps/api/core";

/** Keychain service name Claude Code stores its OAuth login under. */
export const CLAUDE_CODE_KEYCHAIN_SERVICE = "Claude Code-credentials";

export interface KeychainEntry {
  account: string;
  /** Keychain modification stamp, e.g. `20260909084709Z`. */
  modified?: string | null;
}

/** List Keychain accounts under a service, newest first. Reads attributes only, never secrets. */
export async function listKeychainAccounts(service: string): Promise<KeychainEntry[]> {
  return invoke<KeychainEntry[]>("list_keychain_accounts", { service });
}

/** Read one Keychain password, optionally pinned to a specific account. */
export async function readKeychainPassword(service: string, account?: string): Promise<string> {
  return invoke<string>("read_keychain_password", { service, account: account ?? null });
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
