/** Project accounts and their fetch states into the tray menu snapshot. */

import type { AccountPublic } from "../../contracts/accounts";
import type { TrayMenuAccount, TrayMenuRow, TrayMenuSnapshot, TrayMenuTone } from "../../contracts/trayMenu";
import type { AccountFetchState, UsageResult, UsageWindow } from "../../contracts/usage";
import { PROVIDERS } from "../../providers/metadata";
import { formatPercent, formatReset, shortLabel } from "./format";
import { summarizeFreshness } from "./freshness";
import { fetchFailureCopy, severityStatusTone } from "./presentation";

function tone(pct?: number): TrayMenuTone {
  return severityStatusTone(pct);
}

function row(window: UsageWindow): TrayMenuRow {
  const reset = formatReset(window.resetsAt);
  if (window.usedPercent === undefined) {
    return {
      label: window.label,
      value: [window.detail, reset].filter(Boolean).join(" · "),
      tone: "neutral",
    };
  }
  return {
    label: window.detail ? `${window.label} · ${window.detail}` : window.label,
    value: [formatPercent(window.usedPercent), reset].filter(Boolean).join(" · "),
    usedPercent: window.usedPercent,
    tone: tone(window.usedPercent),
  };
}

/** The window closest to its limit — the one worth seeing at a glance. */
function tightest(windows: UsageWindow[]): UsageWindow | undefined {
  let worst: UsageWindow | undefined;
  for (const w of windows) {
    if (w.usedPercent === undefined) continue;
    if (!worst || w.usedPercent > worst.usedPercent!) worst = w;
  }
  return worst;
}

function summaryLabel(label: string): string {
  const short = shortLabel(label);
  return short === "Wk" ? "Weekly" : short;
}

function accountTitle(account: AccountPublic): string {
  const name = PROVIDERS[account.provider].name;
  const label = account.label.trim();
  return !label || label.toLowerCase() === name.toLowerCase() ? name : `${name} · ${label}`;
}

function result(state: AccountFetchState | undefined): UsageResult | undefined {
  if (!state) return undefined;
  return state.status === "ok" ? state.result : state.previous;
}

function alert(state: AccountFetchState | undefined, shown: UsageResult): string | undefined {
  if (state?.status === "error") {
    return state.offline ? "Offline — showing the last update" : `Couldn’t refresh: ${state.message}`;
  }
  return shown.stale ? "Showing cached usage" : undefined;
}

function trayAccount(account: AccountPublic, state: AccountFetchState | undefined): TrayMenuAccount {
  const base = { providerTone: PROVIDERS[account.provider].tone, title: accountTitle(account) };
  const shown = result(state);

  if (!shown) {
    if (state?.status === "error") {
      const copy = fetchFailureCopy(state);
      return { ...base, summary: { tone: "neutral", text: copy.title }, alert: copy.detail, rows: [] };
    }
    return { ...base, summary: { tone: "neutral", text: "Loading…" }, rows: [] };
  }

  const { snapshot } = shown;
  const worst = tightest(snapshot.windows);
  return {
    ...base,
    subtitle: snapshot.planLabel,
    summary: worst
      ? {
          label: summaryLabel(worst.label),
          usedPercent: worst.usedPercent,
          tone: tone(worst.usedPercent),
          text: formatPercent(worst.usedPercent),
        }
      : { tone: "neutral", text: "—" },
    alert: alert(state, shown),
    rows: snapshot.windows.map(row),
  };
}

/** `accounts` is the visible list, in display order. */
export function buildTrayMenuSnapshot(
  accounts: AccountPublic[],
  states: Record<string, AccountFetchState>,
): TrayMenuSnapshot {
  return {
    accounts: accounts.map((a) => trayAccount(a, states[a.id])),
    refreshLabel: summarizeFreshness(
      accounts.map((a) => a.id),
      states,
    ).label,
  };
}
