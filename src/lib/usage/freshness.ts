/** Panel-wide freshness: one summary of how current the visible accounts'
 *  usage is, shown in the toolbar in place of a per-card "updated" line. */

import type { AccountFetchState } from "../../contracts/usage";
import { formatFetchedAt } from "./format";

export interface FreshnessSummary {
  updating: boolean;
  label: string;
}

export function summarizeFreshness(
  accountIds: string[],
  states: Record<string, AccountFetchState>,
): FreshnessSummary {
  let updating = false;
  let failed = 0;
  let oldestFetchedAt: number | undefined;

  for (const id of accountIds) {
    const state = states[id];
    if (!state || state.status === "loading") updating = true;
    if (state?.status === "error") failed += 1;
    const fetchedAt = (state?.status === "ok" ? state.result : state?.previous)?.snapshot.fetchedAt;
    if (fetchedAt !== undefined && (oldestFetchedAt === undefined || fetchedAt < oldestFetchedAt)) {
      oldestFetchedAt = fetchedAt;
    }
  }

  if (updating) return { updating, label: "Updating…" };
  if (oldestFetchedAt === undefined) {
    return { updating, label: failed > 0 ? "Couldn’t update" : "Refresh" };
  }
  const failedSuffix = failed > 0 ? ` · ${failed} failed` : "";
  return { updating, label: `Updated ${formatFetchedAt(oldestFetchedAt)}${failedSuffix}` };
}
