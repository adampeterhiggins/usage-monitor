/** Usage fetch state: the canonical per-account loading/ok/error machine and
 *  the refresh policy that drives it. Lives outside React so every consumer —
 *  cards, views, refresh shortcuts — shares one truth, and a late response
 *  writes into the same map the card is reading. The state machine is a
 *  factory so tests can inject a fetcher without the accounts document. */

import { create } from "zustand";

import { replaceAccountCredential } from "../accounts/operations";
import { getAccount } from "../accounts/repository";
import { fetchUsage } from "./cache";
import type { AccountPublic, UsageResult } from "./types";

export type AccountFetchState =
  | { status: "loading"; previous?: UsageResult }
  | { status: "ok"; result: UsageResult }
  | { status: "error"; message: string; previous?: UsageResult };

export interface UsageService {
  states: Record<string, AccountFetchState>;
  refreshingAll: boolean;
  /** Fetch one account, keeping its previous result visible through
   *  loading and error states. */
  load(accountId: string, force?: boolean): Promise<void>;
  /** Fetch every given account; `refreshingAll` stays true until the last
   *  in-flight request settles. */
  refreshAll(accounts: AccountPublic[], force?: boolean): Promise<void>;
  /** Kick off a load for any account with no state yet. */
  ensureLoaded(accounts: AccountPublic[]): void;
  /** Drop an account's state (it was removed). */
  forget(accountId: string): void;
  /** Drop all states — e.g. after account data changed. */
  reset(): void;
}

type AccountUsageFetcher = (accountId: string, force: boolean) => Promise<UsageResult>;

async function fetchAccountUsage(accountId: string, force: boolean): Promise<UsageResult> {
  const account = await getAccount(accountId);
  if (!account) throw new Error("Account not found.");
  return fetchUsage(account, {
    force,
    persistCredential: (credential) => replaceAccountCredential(accountId, credential),
  });
}

function previousResult(
  current: AccountFetchState | undefined,
): UsageResult | undefined {
  if (!current) return undefined;
  if (current.status === "ok") return current.result;
  return current.previous;
}

export function createUsageService(fetcher: AccountUsageFetcher) {
  return create<UsageService>((set, get) => ({
    states: {},
    refreshingAll: false,

    async load(accountId, force = false) {
      set((prev) => ({
        states: {
          ...prev.states,
          [accountId]: { status: "loading", previous: previousResult(prev.states[accountId]) },
        },
      }));
      try {
        const result = await fetcher(accountId, force);
        set((prev) => ({ states: { ...prev.states, [accountId]: { status: "ok", result } } }));
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        set((prev) => ({
          states: {
            ...prev.states,
            [accountId]: {
              status: "error",
              message,
              previous: previousResult(prev.states[accountId]),
            },
          },
        }));
      }
    },

    async refreshAll(accounts, force = false) {
      if (accounts.length === 0) return;
      set({ refreshingAll: true });
      try {
        await Promise.all(accounts.map((a) => get().load(a.id, force)));
      } finally {
        set({ refreshingAll: false });
      }
    },

    ensureLoaded(accounts) {
      for (const account of accounts) {
        if (!get().states[account.id]) void get().load(account.id, false);
      }
    },

    forget(accountId) {
      set((prev) => {
        if (!(accountId in prev.states)) return prev;
        const next = { ...prev.states };
        delete next[accountId];
        return { states: next };
      });
    },

    reset() {
      set({ states: {} });
    },
  }));
}

/** The app's usage service. */
export const useUsageStore = createUsageService(fetchAccountUsage);
