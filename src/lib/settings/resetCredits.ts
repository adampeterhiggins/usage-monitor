/** How many banked usage resets each account had when last acknowledged, so
 *  a credit granted while the app was closed still reads as new. */

import { settingsStore } from "./store";

const KEY = "seenResetCredits";

export async function getSeenResetCounts(): Promise<Record<string, number>> {
  const stored = await settingsStore.get<Record<string, unknown>>(KEY);
  const counts: Record<string, number> = {};
  for (const [accountId, count] of Object.entries(stored ?? {})) {
    if (typeof count === "number" && Number.isFinite(count)) counts[accountId] = count;
  }
  return counts;
}

export async function setSeenResetCounts(next: Record<string, number>): Promise<void> {
  await settingsStore.set(KEY, next);
  await settingsStore.save();
}
