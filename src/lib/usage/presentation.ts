/** Severity mapping and class selection for usage percentages.
 *
 *  Severity reads resolved `status-*` roles — separate from the theme accent
 *  and from provider identity colors. The thresholds are shared by production
 *  views and the appearance preview so they never drift. */

import type { UsageWindow } from "../../contracts/usage";

export type Severity = "ok" | "warn" | "high" | "critical" | "neutral";

export function severity(pct?: number): Severity {
  if (pct === undefined) return "neutral";
  if (pct >= 90) return "critical";
  if (pct >= 70) return "high";
  if (pct >= 40) return "warn";
  return "ok";
}

/** The status tone backing a severity level. */
export function severityStatusTone(
  pct?: number,
): "healthy" | "warning" | "high" | "critical" | "neutral" {
  switch (severity(pct)) {
    case "critical":
      return "critical";
    case "high":
      return "high";
    case "warn":
      return "warning";
    case "ok":
      return "healthy";
    default:
      return "neutral";
  }
}

export function severityFillClass(pct?: number): string {
  switch (severityStatusTone(pct)) {
    case "critical":
      return "bg-ui-status-critical";
    case "high":
      return "bg-ui-status-high";
    case "warning":
      return "bg-ui-status-warning";
    case "healthy":
      return "bg-ui-status-healthy";
    default:
      return "bg-ui-control";
  }
}

/** Ring stroke for a severity level — the arc twin of `severityFillClass`. */
export function severityStrokeClass(pct?: number): string {
  switch (severityStatusTone(pct)) {
    case "critical":
      return "stroke-ui-status-critical";
    case "high":
      return "stroke-ui-status-high";
    case "warning":
      return "stroke-ui-status-warning";
    case "healthy":
      return "stroke-ui-status-healthy";
    default:
      return "stroke-ui-control";
  }
}

export function severityTextClass(pct?: number): string {
  switch (severityStatusTone(pct)) {
    case "critical":
      return "text-ui-status-critical-text";
    case "high":
      return "text-ui-status-high-text";
    case "warning":
      return "text-ui-status-warning-text";
    case "healthy":
      return "text-ui-status-healthy-text";
    default:
      return "text-ui-tertiary";
  }
}

/** Badge color for a severity level — matches the Badge component's tones. */
export function severityBadgeColor(
  pct?: number,
): "healthy" | "warning" | "high" | "critical" | "secondary" {
  const tone = severityStatusTone(pct);
  return tone === "neutral" ? "secondary" : tone;
}

export function worstPercent(windows: UsageWindow[]): number | undefined {
  const values = windows.map((w) => w.usedPercent).filter((p): p is number => p !== undefined);
  if (values.length === 0) return undefined;
  return Math.max(...values);
}
