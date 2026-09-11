/** Severity mapping and class selection for usage percentages. */

import type { UsageWindow } from "../../contracts/usage";

export type Severity = "ok" | "warn" | "high" | "critical" | "neutral";

export function severity(pct?: number): Severity {
  if (pct === undefined) return "neutral";
  if (pct >= 90) return "critical";
  if (pct >= 70) return "high";
  if (pct >= 40) return "warn";
  return "ok";
}

export function severityColor(pct?: number): "green" | "yellow" | "orange" | "red" | "secondary" {
  switch (severity(pct)) {
    case "critical":
      return "red";
    case "high":
      return "orange";
    case "warn":
      return "yellow";
    case "ok":
      return "green";
    default:
      return "secondary";
  }
}

export function severityFillClass(pct?: number): string {
  switch (severity(pct)) {
    case "critical":
      return "bg-support-red";
    case "high":
      return "bg-support-orange";
    case "warn":
      return "bg-support-yellow";
    case "ok":
      return "bg-support-green";
    default:
      return "bg-control";
  }
}

export function severityTextClass(pct?: number): string {
  switch (severity(pct)) {
    case "critical":
      return "text-support-red";
    case "high":
      return "text-support-orange";
    case "warn":
      return "text-support-yellow";
    case "ok":
      return "text-support-green";
    default:
      return "text-tertiary";
  }
}

export function worstPercent(windows: UsageWindow[]): number | undefined {
  const values = windows.map((w) => w.usedPercent).filter((p): p is number => p !== undefined);
  if (values.length === 0) return undefined;
  return Math.max(...values);
}
