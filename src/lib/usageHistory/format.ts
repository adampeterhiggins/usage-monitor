/** Display formatting for usage history, ported from t3code's
 *  `usageFormat`. */

import type { UsagePeriod, UsageWindow } from "./window";
import { localDayKey } from "./window";

const CURRENCY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const INTEGER = new Intl.NumberFormat("en-US");

export function formatUsd(value: number): string {
  return CURRENCY.format(value);
}

export function formatCount(value: number): string {
  return INTEGER.format(Math.round(value));
}

function trim(value: number): string {
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return value.toFixed(digits).replace(/\.0+$/, "");
}

/** Three significant figures with a unit suffix, so columns line up
 *  (`19.9B`, `76.7M`, `804K`). */
export function formatTokens(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${trim(value / 1e12)}T`;
  if (abs >= 1e9) return `${trim(value / 1e9)}B`;
  if (abs >= 1e6) return `${trim(value / 1e6)}M`;
  if (abs >= 1e3) return `${trim(value / 1e3)}K`;
  return INTEGER.format(Math.round(value));
}

/** A 0–1 share as a percent; a non-zero share below the precision reads
 *  `<0.1%` rather than rounding to zero. */
export function formatShare(share: number, digits = 1): string {
  const percent = share * 100;
  const smallest = 10 ** -digits;
  if (percent > 0 && percent < smallest) return `<${smallest.toFixed(digits)}%`;
  return `${percent.toFixed(digits)}%`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `2026-09-28` to `Sep 28`. */
export function formatDayShort(dayKey: string): string {
  const [, month, day] = dayKey.split("-").map(Number);
  if (!month || !day) return dayKey;
  return `${MONTHS[month - 1] ?? ""} ${day}`;
}

export function formatHourShort(startMs: number): string {
  return new Date(startMs).toLocaleTimeString("en-US", { hour: "numeric" });
}

/** Axis / table label for one period. */
export function formatPeriod(period: UsagePeriod, resolution: UsageWindow["resolution"]): string {
  return resolution === "hour" ? formatHourShort(period.startMs) : formatDayShort(period.key);
}

/** Tooltip label: hours read relative to the window's reference day. */
export function formatPeriodDetail(period: UsagePeriod, window: UsageWindow): string {
  if (window.resolution === "day") {
    const weekday = new Date(period.startMs).toLocaleDateString("en-US", { weekday: "short" });
    return `${weekday}, ${formatDayShort(period.key)}`;
  }
  const hour = formatHourShort(period.startMs);
  const today = localDayKey(new Date(window.referenceMs));
  const day = localDayKey(new Date(period.startMs));
  if (day === today) return `${hour} today`;
  return `${hour} yesterday`;
}
