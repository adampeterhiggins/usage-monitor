import * as React from "react";
import type { AccountFetchState } from "../components/accounts/account-card";
import { fetchAccountUsage } from "../lib/accounts";
import type { AccountPublic } from "../lib/usage/types";

export interface UsageFetch {
  fetchStates: Record<string, AccountFetchState>;
  refreshingAll: boolean;
  loadOne: (account: AccountPublic, force: boolean) => Promise<void>;
  refreshAll: (force: boolean) => Promise<void>;
  resetFetchStates: () => void;
}

/** Per-account fetch state machine: load missing accounts, keep previous data
 * visible through loading and error states. */
export function useUsageFetch(accounts: AccountPublic[]): UsageFetch {
  const [fetchStates, setFetchStates] = React.useState<Record<string, AccountFetchState>>({});
  const [refreshingAll, setRefreshingAll] = React.useState(false);

  const loadOne = React.useCallback(async (account: AccountPublic, force: boolean) => {
    setFetchStates((prev) => {
      const current = prev[account.id];
      const previous =
        current?.status === "ok"
          ? current.result
          : current?.status === "error" || current?.status === "loading"
            ? current.previous
            : undefined;
      return { ...prev, [account.id]: { status: "loading", previous } };
    });
    try {
      const result = await fetchAccountUsage(account.id, force);
      setFetchStates((prev) => ({ ...prev, [account.id]: { status: "ok", result } }));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setFetchStates((prev) => {
        const current = prev[account.id];
        const previous =
          current?.status === "loading" || current?.status === "error"
            ? current.previous
            : current?.status === "ok"
              ? current.result
              : undefined;
        return { ...prev, [account.id]: { status: "error", message, previous } };
      });
    }
  }, []);

  const refreshAll = React.useCallback(
    async (force: boolean) => {
      if (accounts.length === 0) return;
      setRefreshingAll(true);
      try {
        await Promise.all(accounts.map((a) => loadOne(a, force)));
      } finally {
        setRefreshingAll(false);
      }
    },
    [accounts, loadOne],
  );

  React.useEffect(() => {
    for (const account of accounts) {
      if (!fetchStates[account.id]) void loadOne(account, false);
    }
  }, [accounts, fetchStates, loadOne]);

  const resetFetchStates = React.useCallback(() => setFetchStates({}), []);

  return { fetchStates, refreshingAll, loadOne, refreshAll, resetFetchStates };
}
