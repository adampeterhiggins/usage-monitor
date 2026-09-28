/** Reporting windows for usage history. Periods are cut on this Mac's local
 *  calendar, so a turn lands on the day the user experienced it; the native
 *  scan buckets against the boundaries computed here. */

import type { UsageWindowDays } from "../../contracts/usageHistory";

export const USAGE_WINDOW_OPTIONS: ReadonlyArray<{ days: UsageWindowDays; label: string }> = [
  { days: 1, label: "24h" },
  { days: 7, label: "7d" },
  { days: 30, label: "30d" },
  { days: 90, label: "90d" },
];

export function isUsageWindowDays(value: unknown): value is UsageWindowDays {
  return USAGE_WINDOW_OPTIONS.some((option) => option.days === value);
}

export interface UsagePeriod {
  /** `YYYY-MM-DD` (local) for days, the ISO start instant for hours. */
  key: string;
  startMs: number;
  endMs: number;
}

export interface UsageWindow {
  days: UsageWindowDays;
  resolution: "day" | "hour";
  periods: UsagePeriod[];
  /** N+1 ascending edges for the N periods, as the scan expects. */
  boundaries: number[];
  /** The instant the window was cut, for "today" / "yesterday" labels. */
  referenceMs: number;
}

const HOUR_MS = 60 * 60 * 1000;

export function localDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Days are local-midnight to local-midnight via calendar arithmetic, so a
 * DST transition yields a 23- or 25-hour day rather than a skewed edge. The
 * rolling 24h window uses fixed hours from a minute-aligned "now".
 */
export function makeUsageWindow(days: UsageWindowDays, now = new Date()): UsageWindow {
  if (days === 1) {
    const untilMs = Math.floor(now.getTime() / 60_000) * 60_000;
    const sinceMs = untilMs - 24 * HOUR_MS;
    const periods: UsagePeriod[] = [];
    for (let start = sinceMs; start < untilMs; start += HOUR_MS) {
      periods.push({ key: new Date(start).toISOString(), startMs: start, endMs: start + HOUR_MS });
    }
    return {
      days,
      resolution: "hour",
      periods,
      boundaries: [...periods.map((p) => p.startMs), untilMs],
      referenceMs: now.getTime(),
    };
  }

  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const periods: UsagePeriod[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const start = new Date(y, m, d - offset);
    const end = new Date(y, m, d - offset + 1);
    periods.push({ key: localDayKey(start), startMs: start.getTime(), endMs: end.getTime() });
  }
  return {
    days,
    resolution: "day",
    periods,
    boundaries: [...periods.map((p) => p.startMs), periods[periods.length - 1].endMs],
    referenceMs: now.getTime(),
  };
}
