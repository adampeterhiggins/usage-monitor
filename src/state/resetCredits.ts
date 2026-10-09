/** Banked usage resets per account, cached so the account menu can show a
 *  count without asking the provider on every open. Refreshes ride the usage
 *  refresh triggers with a TTL, like provider status. A failed fetch keeps
 *  the last known credits.
 *
 *  Each account also has a persisted "seen" count. A fetch that finds more
 *  credits than were seen flags the account until the resets dialog is
 *  opened; the first fetch for an account, or one that finds fewer (a credit
 *  was spent or expired), just moves the baseline. */

import { create } from "zustand";

import type { ResetCredits } from "../contracts/resets";
import { getSeenResetCounts, setSeenResetCounts } from "../lib/settings/resetCredits";
import { readResetCredits } from "../lib/usage/resets";

const RESETS_TTL_MS = 5 * 60_000;

export interface ResetCreditsDeps {
  fetch(accountId: string): Promise<ResetCredits>;
  readSeen(): Promise<Record<string, number>>;
  writeSeen(next: Record<string, number>): Promise<void>;
  now?: () => number;
}

export interface ResetCreditsService {
  credits: Record<string, ResetCredits>;
  seen: Record<string, number>;
  refresh(accountIds: Iterable<string>, force?: boolean): Promise<void>;
  /** Cache credits read elsewhere, e.g. by the resets dialog. */
  record(accountId: string, credits: ResetCredits): Promise<void>;
  /** Mark the account's current credits as seen, clearing its alert. */
  acknowledge(accountId: string): Promise<void>;
}

export function createResetCreditsService(deps: ResetCreditsDeps) {
  const now = deps.now ?? Date.now;
  const fetchedAt = new Map<string, number>();
  const inFlight = new Map<string, Promise<void>>();
  let hydrated: Promise<void> | undefined;

  return create<ResetCreditsService>((set, get) => {
    function hydrate(): Promise<void> {
      hydrated ??= deps
        .readSeen()
        .catch(() => ({}))
        .then((stored) => set((prev) => ({ seen: { ...stored, ...prev.seen } })));
      return hydrated;
    }

    function writeSeen(accountId: string, count: number) {
      const seen = { ...get().seen, [accountId]: count };
      set({ seen });
      return deps.writeSeen(seen).catch(() => undefined);
    }

    async function record(accountId: string, credits: ResetCredits) {
      await hydrate();
      fetchedAt.set(accountId, now());
      set((prev) => ({ credits: { ...prev.credits, [accountId]: credits } }));
      const seen = get().seen[accountId];
      if (seen === undefined || credits.availableCount < seen) {
        await writeSeen(accountId, credits.availableCount);
      }
    }

    return {
      credits: {},
      seen: {},
      record,

      async refresh(accountIds, force = false) {
        const pending: Promise<void>[] = [];
        for (const accountId of new Set(accountIds)) {
          const running = inFlight.get(accountId);
          if (running) {
            pending.push(running);
            continue;
          }
          const last = fetchedAt.get(accountId);
          if (!force && last !== undefined && now() - last < RESETS_TTL_MS) continue;
          const request = deps
            .fetch(accountId)
            .then((credits) => record(accountId, credits))
            .catch(() => {})
            .finally(() => inFlight.delete(accountId));
          inFlight.set(accountId, request);
          pending.push(request);
        }
        await Promise.all(pending);
      },

      async acknowledge(accountId) {
        await hydrate();
        const credits = get().credits[accountId];
        if (!credits || get().seen[accountId] === credits.availableCount) return;
        await writeSeen(accountId, credits.availableCount);
      },
    };
  });
}

export const useResetCreditsStore = createResetCreditsService({
  fetch: readResetCredits,
  readSeen: getSeenResetCounts,
  writeSeen: setSeenResetCounts,
});

/** Whether credits arrived since the user last opened the resets dialog. */
export function hasNewResetCredits(state: ResetCreditsService, accountId: string): boolean {
  const count = state.credits[accountId]?.availableCount;
  const seen = state.seen[accountId];
  return count !== undefined && seen !== undefined && count > seen;
}

/** Banked resets for the account (undefined until first read). */
export function useResetCredits(accountId: string): { count?: number; isNew: boolean } {
  const count = useResetCreditsStore((s) => s.credits[accountId]?.availableCount);
  const isNew = useResetCreditsStore((s) => hasNewResetCredits(s, accountId));
  return { count, isNew };
}
