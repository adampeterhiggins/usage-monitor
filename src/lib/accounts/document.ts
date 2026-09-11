/** Accounts persistence: the `accounts.json` document and load/persist.
 *  Stored rows are decoded/encoded through the codec — this module knows
 *  nothing about credential semantics. */

import type { Account } from "../../contracts/accounts";
import { openDocumentStore } from "../../platform/persistence";
import { decodeStoredAccount, encodeAccount } from "./codec";

const store = openDocumentStore("accounts.json");
const ACCOUNTS_KEY = "accounts";

export async function loadAccounts(): Promise<Account[]> {
  const raw = await store.get(ACCOUNTS_KEY);
  if (!Array.isArray(raw)) return [];
  return raw
    .map(decodeStoredAccount)
    .filter((account): account is Account => account !== null);
}

export async function persistAccounts(accounts: Account[]): Promise<void> {
  await store.set(ACCOUNTS_KEY, accounts.map(encodeAccount));
  await store.save();
}
