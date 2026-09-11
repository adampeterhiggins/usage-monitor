/** Accounts persistence: the `accounts.json` document, its normalization, and
 *  load/persist. The only module that knows the storage key and shape. */

import { LazyStore } from "@tauri-apps/plugin-store";

import type { Account, ProviderId } from "../usage/types";

const store = new LazyStore("accounts.json");
const ACCOUNTS_KEY = "accounts";
const PROVIDERS = new Set<ProviderId>(["claude", "codex", "cursor"]);

export function normalizeAccountsDocument(value: unknown): Account[] {
  if (!Array.isArray(value)) return [];
  const out: Account[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const a = raw as Record<string, unknown>;
    if (typeof a.id !== "string" || typeof a.label !== "string") continue;
    if (typeof a.provider !== "string" || !PROVIDERS.has(a.provider as ProviderId)) continue;
    out.push({
      id: a.id,
      provider: a.provider as ProviderId,
      label: a.label,
      credential: typeof a.credential === "string" ? a.credential : "",
      extra: typeof a.extra === "string" && a.extra ? a.extra : undefined,
      hidden: a.hidden === true,
    });
  }
  return out;
}

export async function loadAccounts(): Promise<Account[]> {
  return normalizeAccountsDocument(await store.get(ACCOUNTS_KEY));
}

export async function persistAccounts(accounts: Account[]): Promise<void> {
  await store.set(ACCOUNTS_KEY, accounts);
  await store.save();
}
