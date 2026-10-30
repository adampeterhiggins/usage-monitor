/** The usage summary the webview hands the native status-item menu.
 *
 *  Every string is display-ready: the native side only lays it out, so
 *  wording, severity, and ordering stay in one place (`lib/usage/trayMenu`).
 *  Field names are camelCase on the wire and must match `tray_menu.rs`. */

/** Severity of a bar — mirrors `severityStatusTone` without `info`. */
export type TrayMenuTone = "healthy" | "warning" | "high" | "critical" | "neutral";

/** One usage window, shown as a labelled bar in the account's submenu. */
export interface TrayMenuRow {
  label: string;
  /** Right-aligned secondary text: "63% · resets in 3 d 2 hr". */
  value: string;
  /** Draws a bar when present. */
  usedPercent?: number;
  tone: TrayMenuTone;
}

/** Provider identity colour — the panel's badge tones. */
export type TrayMenuProviderTone = "orange" | "green" | "blue" | "purple" | "slate" | "teal" | "pink";

/** One account: a single top-level row whose submenu holds its windows. */
export interface TrayMenuAccount {
  providerTone: TrayMenuProviderTone;
  /** "Claude · Work", or just the provider name when the label repeats it. */
  title: string;
  /** Plan name, shown in the submenu header. */
  subtitle?: string;
  /** The tightest window, drawn inline on the top-level row. */
  summary: {
    /** Short window name ("5h", "Weekly"); absent when there is no data. */
    label?: string;
    usedPercent?: number;
    tone: TrayMenuTone;
    /** "63%", or "Loading…" / "Offline" when there is nothing to draw. */
    text: string;
  };
  /** A note about the data itself: a failed refresh, cached figures. */
  alert?: string;
  rows: TrayMenuRow[];
}

export interface TrayMenuSnapshot {
  accounts: TrayMenuAccount[];
  /** Shown beside Refresh: "Updated 2 min ago", "Updating…". */
  refreshLabel: string;
}
