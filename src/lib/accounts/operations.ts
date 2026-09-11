/** Write side of the accounts document. Every mutation loads the latest
 *  document, applies the change, persists, and returns the public projection
 *  — callers then publish through the accounts store rather than managing
 *  their own copy. Usage-cache invalidation rides along so a credential or
 *  removal never serves a stale snapshot. */

import type { Account, AccountPublic } from "../../contracts/accounts";
import { toPublic } from "../../contracts/accounts";
import type { AccountAuth } from "../../contracts/auth";
import { authAllowedForProvider } from "../../contracts/auth";
import type { ProviderId } from "../../contracts/providers";
import { invalidate } from "../usage/policy";
import { loadAccounts, persistAccounts } from "./document";

export interface AccountInput {
  provider: ProviderId;
  label: string;
  auth: AccountAuth;
}

export async function addAccount(input: AccountInput): Promise<AccountPublic> {
  if (!authAllowedForProvider(input.provider, input.auth)) {
    throw new Error("That sign-in method isn’t available for this provider.");
  }
  const accounts = await loadAccounts();
  const account: Account = {
    id: crypto.randomUUID(),
    provider: input.provider,
    label: input.label.trim(),
    auth: input.auth,
    hidden: false,
  };
  accounts.push(account);
  await persistAccounts(accounts);
  return toPublic(account);
}

export async function updateAccount(
  input: AccountInput & { id: string },
): Promise<AccountPublic> {
  if (!authAllowedForProvider(input.provider, input.auth)) {
    throw new Error("That sign-in method isn’t available for this provider.");
  }
  const accounts = await loadAccounts();
  const idx = accounts.findIndex((a) => a.id === input.id);
  if (idx < 0) throw new Error("Account not found.");
  accounts[idx] = {
    id: input.id,
    provider: input.provider,
    label: input.label.trim(),
    auth: input.auth,
    hidden: accounts[idx].hidden,
  };
  await persistAccounts(accounts);
  invalidate(input.id);
  return toPublic(accounts[idx]);
}

export async function setAccountHidden(id: string, hidden: boolean): Promise<AccountPublic> {
  const accounts = await loadAccounts();
  const idx = accounts.findIndex((a) => a.id === id);
  if (idx < 0) throw new Error("Account not found.");
  accounts[idx] = { ...accounts[idx], hidden };
  await persistAccounts(accounts);
  return toPublic(accounts[idx]);
}

/** Persist a refreshed credential, updating only the auth material —
 *  provider, label, order, visibility, and selectors are preserved. */
export async function replaceAccountCredential(
  id: string,
  credential: string,
): Promise<void> {
  const accounts = await loadAccounts();
  const idx = accounts.findIndex((a) => a.id === id);
  if (idx < 0) return;
  const auth = accounts[idx].auth;
  // The legacy shape stored the material either way; keep that reachable
  // behavior even if a refresh hook ever fires for a local-login account.
  accounts[idx] = {
    ...accounts[idx],
    auth:
      auth.kind === "session" || auth.kind === "pasted"
        ? { ...auth, credential }
        : { kind: "pasted", credential },
  };
  await persistAccounts(accounts);
}

export async function removeAccount(id: string): Promise<void> {
  const accounts = await loadAccounts();
  const next = accounts.filter((a) => a.id !== id);
  if (next.length === accounts.length) return;
  await persistAccounts(next);
  invalidate(id);
}

/** Persist a new account order. `orderedIds` must contain every existing
 *  account id exactly once. */
export async function reorderAccounts(orderedIds: string[]): Promise<AccountPublic[]> {
  const accounts = await loadAccounts();
  if (orderedIds.length !== accounts.length) {
    throw new Error("Account order is out of date. Close and reopen Manage Accounts.");
  }
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const next: Account[] = [];
  for (const id of orderedIds) {
    const account = byId.get(id);
    if (!account)
      throw new Error("Account order is out of date. Close and reopen Manage Accounts.");
    next.push(account);
    byId.delete(id);
  }
  if (byId.size > 0) {
    throw new Error("Account order is out of date. Close and reopen Manage Accounts.");
  }
  await persistAccounts(next);
  return next.map(toPublic);
}
