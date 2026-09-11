/** Read side of the accounts document: the canonical account list and
 *  per-account lookups. `listAccounts` returns the public projection;
 *  `getAccountAuth` is the only secret-bearing read and exists for the
 *  edit form and usage fetchers. */

import type { Account, AccountPublic } from "../contracts/accounts";
import { toPublic } from "../contracts/accounts";
import type { AccountAuth } from "../contracts/auth";
import { loadAccounts } from "./document";

export async function listAccounts(): Promise<AccountPublic[]> {
  return (await loadAccounts()).map(toPublic);
}

export async function getAccount(id: string): Promise<Account | undefined> {
  return (await loadAccounts()).find((a) => a.id === id);
}

/** The account's full auth configuration — secret-bearing. */
export async function getAccountAuth(id: string): Promise<AccountAuth> {
  const account = await getAccount(id);
  if (!account) throw new Error("Account not found.");
  return account.auth;
}
