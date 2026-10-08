/** Panel-wide freshness: one summary of how current the visible accounts'
 *  usage is, shown in the toolbar in place of a per-card "updated" line. */

import type { AccountFetchState } from "../../contracts/usage";
import { formatFetchedAt } from "./format";

export interface FreshnessSummary {
  updating: boolean;
  /** Fetches are failing for want of a network and nothing has come back
   *  fresh, so the numbers on screen are the last ones we saw. */
  offline: boolean;
  label: string;
}

export function summarizeFreshness(
  accountIds: string[],
  states: Record<string, AccountFetchState>,
): FreshnessSummary {
  let updating = false;
  let failed = 0;
  let unreachable = 0;
  let reachedProvider = false;
  let oldestFetchedAt: number | undefined;

  for (const id of accountIds) {
    const state = states[id];
    if (!state || state.status === "loading") updating = true;
    if (state?.status === "error") failed += 1;
    if (state?.status === "error" && state.offline) unreachable += 1;
    // A cached result was served without a request, so it says nothing
    // about whether the network is up.
    if (state?.status === "ok" && !state.result.cached) reachedProvider = true;
    const fetchedAt = (state?.status === "ok" ? state.result : state?.previous)?.snapshot.fetchedAt;
    if (fetchedAt !== undefined && (oldestFetchedAt === undefined || fetchedAt < oldestFetchedAt)) {
      oldestFetchedAt = fetchedAt;
    }
  }

  if (updating) return { updating, offline: false, label: "Updating…" };
  if (unreachable > 0 && !reachedProvider) {
    return {
      updating,
      offline: true,
      label:
        oldestFetchedAt === undefined
          ? "Offline"
          : `Offline · updated ${formatFetchedAt(oldestFetchedAt)}`,
    };
  }
  if (oldestFetchedAt === undefined) {
    return { updating, offline: false, label: failed > 0 ? "Couldn’t update" : "Refresh" };
  }
  const failedSuffix = failed > 0 ? ` · ${failed} failed` : "";
  return {
    updating,
    offline: false,
    label: `Updated ${formatFetchedAt(oldestFetchedAt)}${failedSuffix}`,
  };
}
