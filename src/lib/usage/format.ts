/** Label, percent, and time formatting for usage data. */

export function shortLabel(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("session") || l.startsWith("5h")) return "5h";
  if (l === "weekly · all models" || l === "weekly limit") return "Wk";
  if (label.includes("·")) return label.split("·").pop()!.trim();
  if (l.includes("cursor models")) return "Cursor";
  if (l.includes("other models")) return "API";
  if (l.includes("on-demand")) return "On-demand";
  return label.length > 14 ? `${label.slice(0, 13)}…` : label;
}

export function formatReset(resetsAt?: number): string | undefined {
  if (resetsAt === undefined) return undefined;
  const ms = resetsAt - Date.now();
  if (ms <= 0) return "resetting…";
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 60) return `resets in ${totalMin} min`;
  const totalHr = totalMin / 60;
  if (totalHr < 48) return `resets in ${Math.floor(totalHr)} hr ${totalMin % 60} min`;
  const days = Math.floor(totalHr / 24);
  return `resets in ${days} d ${Math.round(totalHr % 24)} hr`;
}

export function formatFetchedAt(fetchedAt: number): string {
  const ageMs = Date.now() - fetchedAt;
  if (ageMs < 60_000) return "just now";
  if (ageMs < 3_600_000) return `${Math.round(ageMs / 60_000)} min ago`;
  return new Date(fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatPercent(pct?: number): string {
  if (pct === undefined) return "—";
  const rounded = Math.round(pct * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}
