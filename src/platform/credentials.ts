/** Local credential discovery — home-directory files, macOS Keychain
 *  entries, and the Cursor desktop app's session store. Read-only; nothing
 *  here writes secrets. */

import { invoke } from "@tauri-apps/api/core";

export interface KeychainEntry {
  account: string;
  /** Keychain modification stamp, e.g. `20260909084709Z`. */
  modified?: string | null;
}

export interface CursorIdeLogin {
  email?: string | null;
  membership?: string | null;
}

/** Read a file relative to the user's home directory. Throws when absent. */
export async function readHomeFile(relPath: string): Promise<string> {
  return invoke<string>("read_home_file", { relPath });
}

/** List Keychain accounts under a service, newest first. Attributes only. */
export async function listKeychainAccounts(service: string): Promise<KeychainEntry[]> {
  return invoke<KeychainEntry[]>("list_keychain_accounts", { service });
}

/** Read one Keychain password, optionally pinned to a specific account. */
export async function readKeychainPassword(
  service: string,
  account?: string,
): Promise<string> {
  return invoke<string>("read_keychain_password", {
    service,
    account: account ?? null,
  });
}

/** Picker metadata for the Cursor IDE login — never the access token. */
export async function cursorIdeLoginMeta(): Promise<CursorIdeLogin | null> {
  return invoke<CursorIdeLogin | null>("cursor_ide_login_meta");
}

/** The Cursor desktop app's access token, read from `state.vscdb`. */
export async function readCursorIdeAccessToken(): Promise<string> {
  return invoke<string>("read_cursor_ide_access_token");
}
