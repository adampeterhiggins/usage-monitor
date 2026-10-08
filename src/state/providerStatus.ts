/** Provider service status, shared by every account card for that provider.
 *  Refreshes ride the usage refresh triggers (mount, panel shown, refresh
 *  all) with a short TTL so opening the tray repeatedly doesn't re-poll. A
 *  failed fetch keeps the last known status: an unreachable status page is
 *  not itself an incident. */

import { create } from "zustand";

import type { ProviderId } from "../contracts/providers";
import { fetchProviderStatus, type ProviderStatus } from "../providers/shared/status";

const STATUS_TTL_MS = 2 * 60_000;

type StatusFetcher = (provider: ProviderId) => Promise<ProviderStatus>;

export interface ProviderStatusService {
  statuses: Partial<Record<ProviderId, ProviderStatus>>;
  refresh(providers: Iterable<ProviderId>, force?: boolean): Promise<void>;
}

export function createProviderStatusService(fetcher: StatusFetcher, now: () => number = Date.now) {
  const fetchedAt = new Map<ProviderId, number>();
  const inFlight = new Map<ProviderId, Promise<void>>();

  return create<ProviderStatusService>((set) => ({
    statuses: {},

    async refresh(providers, force = false) {
      const pending: Promise<void>[] = [];
      for (const provider of new Set(providers)) {
        const running = inFlight.get(provider);
        if (running) {
          pending.push(running);
          continue;
        }
        const last = fetchedAt.get(provider);
        if (!force && last !== undefined && now() - last < STATUS_TTL_MS) continue;
        const request = fetcher(provider)
          .then((status) => {
            fetchedAt.set(provider, now());
            set((prev) => ({ statuses: { ...prev.statuses, [provider]: status } }));
          })
          .catch(() => {})
          .finally(() => inFlight.delete(provider));
        inFlight.set(provider, request);
        pending.push(request);
      }
      await Promise.all(pending);
    },
  }));
}

export const useProviderStatusStore = createProviderStatusService(fetchProviderStatus);

/** The provider's status when it has an issue worth flagging, else undefined. */
export function useProviderIssue(provider: ProviderId): ProviderStatus | undefined {
  return useProviderStatusStore((s) => {
    const status = s.statuses[provider];
    return status && status.indicator !== "none" ? status : undefined;
  });
}
