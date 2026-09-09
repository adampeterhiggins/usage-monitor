export type ProviderId = "claude" | "codex" | "cursor";

export type Layout = "wall" | "grouped" | "stacked" | "ledger" | "strip" | "focus";

export const LAYOUTS: Array<{ id: Layout; label: string }> = [
  { id: "wall", label: "Wall" },
  { id: "grouped", label: "Grouped" },
  { id: "stacked", label: "Stacked" },
  { id: "ledger", label: "Ledger" },
  { id: "strip", label: "Strip" },
  { id: "focus", label: "Focus" },
];

export interface Account {
  id: string;
  provider: ProviderId;
  label: string;
  credential: string;
  /**
   * Provider-specific secondary setting.
   * - Native mode (blank credential) for Claude, Codex, and Cursor: the macOS Keychain
   *   account to read the CLI login from when several exist (blank = automatic).
   * - Native mode for Cursor: `ide` pins the Cursor app login; a Keychain
   *   account name pins cursor-agent (blank = automatic, IDE first).
   * - Codex with a pasted raw access token: the ChatGPT account id.
   */
  extra?: string;
  hidden: boolean;
}

export interface AccountPublic {
  id: string;
  provider: ProviderId;
  label: string;
  hasCredential: boolean;
  extra?: string;
  hidden: boolean;
}

export interface UsageWindow {
  label: string;
  usedPercent?: number;
  resetsAt?: number;
  detail?: string;
}

export interface UsageSnapshot {
  planLabel?: string;
  windows: UsageWindow[];
  fetchedAt: number;
}

export interface UsageResult {
  snapshot: UsageSnapshot;
  cached: boolean;
  stale: boolean;
}

export interface ProviderMeta {
  id: ProviderId;
  name: string;
  accent: "orange" | "green" | "blue";
  credentialTitle: string;
  credentialHelp: string;
  credentialOptional: boolean;
  credentialPlaceholder: string;
}

export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  claude: {
    id: "claude",
    name: "Claude",
    accent: "orange",
    credentialTitle: "Session Key",
    credentialHelp:
      "Sign in to give this account its own Claude session, or paste a claude.ai sessionKey (sk-ant-sid01-…). Leave blank to use your Claude Code login from the macOS Keychain.",
    credentialOptional: true,
    credentialPlaceholder: "Optional — uses Claude Code login",
  },
  codex: {
    id: "codex",
    name: "Codex",
    accent: "green",
    credentialTitle: "Auth JSON / Access Token",
    credentialHelp:
      "Sign in to give this account its own Codex session, or paste ~/.codex/auth.json (or its access token). Leave blank to use your Codex CLI login from the macOS Keychain or ~/.codex/auth.json.",
    credentialOptional: true,
    credentialPlaceholder: "Optional — uses Codex CLI login",
  },
  cursor: {
    id: "cursor",
    name: "Cursor",
    accent: "blue",
    credentialTitle: "Session Cookie",
    credentialHelp:
      "Sign in to give this account its own Cursor session, or paste the WorkosCursorSessionToken cookie. Leave blank to use your Cursor app or cursor-agent login.",
    credentialOptional: true,
    credentialPlaceholder: "Optional — uses Cursor / cursor-agent login",
  },
};

export const PROVIDER_ORDER: ProviderId[] = ["claude", "codex", "cursor"];

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

export function formatPercent(pct?: number): string {
  if (pct === undefined) return "—";
  const rounded = Math.round(pct * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

export function toPublic(account: Account): AccountPublic {
  return {
    id: account.id,
    provider: account.provider,
    label: account.label,
    hasCredential: account.credential.trim().length > 0,
    extra: account.extra,
    hidden: account.hidden,
  };
}
