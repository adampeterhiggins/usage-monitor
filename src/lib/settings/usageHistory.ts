/** Usage History dialog preferences: the chosen window and metric. */

import type { UsageHistoryMetric, UsageWindowDays } from "../../contracts/usageHistory";
import { isUsageWindowDays } from "../usageHistory/window";
import { settingsStore } from "./store";

export interface UsageHistoryPreferences {
  windowDays: UsageWindowDays;
  metric: UsageHistoryMetric;
}

export const DEFAULT_USAGE_HISTORY_PREFERENCES: UsageHistoryPreferences = {
  windowDays: 30,
  metric: "cost",
};

export async function getUsageHistoryPreferences(): Promise<UsageHistoryPreferences> {
  const stored = await settingsStore.get<Partial<UsageHistoryPreferences>>("usageHistory");
  return {
    windowDays: isUsageWindowDays(stored?.windowDays)
      ? stored.windowDays
      : DEFAULT_USAGE_HISTORY_PREFERENCES.windowDays,
    metric:
      stored?.metric === "cost" || stored?.metric === "tokens"
        ? stored.metric
        : DEFAULT_USAGE_HISTORY_PREFERENCES.metric,
  };
}

export async function setUsageHistoryPreferences(next: UsageHistoryPreferences): Promise<void> {
  await settingsStore.set("usageHistory", next);
  await settingsStore.save();
}
