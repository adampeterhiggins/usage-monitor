/** Read side of the accounts document: the canonical account list and
 *  per-account lookups. Secrets never leave these calls — `listAccounts`
 *  returns the public projection. */

import type { Account, AccountPublic } from "../usage/types";
import { toPublic } from "../usage/types";
import { loadAccounts } from "./document";

export async function listAccounts(): Promise<AccountPublic[]> {
  return (await loadAccounts()).map(toPublic);
}

export async function getAccount(id: string): Promise<Account | undefined> {
  return (await loadAccounts()).find((a) => a.id === id);
}

export async function getAccountSecret(
  id: string,
): Promise<{ credential: string; extra?: string }> {
  const account = await getAccount(id);
  if (!account) throw new Error("Account not found.");
  return { credential: account.credential, extra: account.extra };
}
