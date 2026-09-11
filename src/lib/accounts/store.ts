/** Canonical account list for the UI. Components read `accounts` here and
 *  call these actions instead of the repository/operations functions —
 *  every mutation persists, republishes the list, and keeps the usage
 *  service's fetch states coherent (a saved account re-fetches, a removed
 *  account's state is dropped). */

import { create } from "zustand";

import { useUsageStore } from "../usage/service";
import type { AccountPublic } from "../usage/types";
import {
  addAccount,
  removeAccount,
  reorderAccounts,
  setAccountHidden,
  updateAccount,
  type AccountInput,
} from "./operations";
import { listAccounts } from "./repository";

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
    useUsageStore.getState().reset();
    return added;
  },

  async update(input) {
    const updated = await updateAccount(input);
    await get().refresh();
    useUsageStore.getState().reset();
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
