/** Canonical account list for the UI. Components read `accounts` here and
 *  call these actions instead of the repository/operations functions —
 *  every mutation persists, republishes the list, and keeps the usage
 *  service's fetch states coherent. Only the account that changed is
 *  (re)fetched: resetting every state on add made all cards re-enter
 *  "loading" and refetch in parallel, which stalled the whole panel. */

import { create } from "zustand";

import { useUsageStore } from "./usage";
import type { AccountPublic } from "../contracts/accounts";
import {
  addAccount,
  removeAccount,
  reorderAccounts,
  setAccountHidden,
  updateAccount,
  type AccountInput,
} from "../lib/accounts/operations";
import { listAccounts } from "../lib/accounts/repository";

export interface AccountsStore {
  loaded: boolean;
  accounts: AccountPublic[];
  /** Reload the public list from the persisted document. */
  refresh(): Promise<void>;
  add(input: AccountInput): Promise<AccountPublic>;
  update(input: AccountInput & { id: string }): Promise<AccountPublic>;
  setHidden(id: string, hidden: boolean): Promise<void>;
  remove(id: string): Promise<void>;
  reorder(orderedIds: string[]): Promise<void>;
}

export const useAccountsStore = create<AccountsStore>((set, get) => ({
  loaded: false,
  accounts: [],

  async refresh() {
    set({ accounts: await listAccounts(), loaded: true });
  },

  async add(input) {
    const added = await addAccount(input);
    await get().refresh();
    void useUsageStore.getState().load(added.id);
    return added;
  },

  async update(input) {
    const updated = await updateAccount(input);
    await get().refresh();
    // The credential may have changed — re-fetch just this account (its
    // policy cache was already invalidated inside updateAccount).
    void useUsageStore.getState().load(input.id, true);
    return updated;
  },

  async setHidden(id, hidden) {
    await setAccountHidden(id, hidden);
    await get().refresh();
  },

  async remove(id) {
    await removeAccount(id);
    await get().refresh();
    useUsageStore.getState().forget(id);
  },

  async reorder(orderedIds) {
    const next = await reorderAccounts(orderedIds);
    set({ accounts: next });
  },
}));
