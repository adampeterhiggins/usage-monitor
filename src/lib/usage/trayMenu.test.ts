import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AccountPublic } from "../../contracts/accounts";
import type { AccountFetchState, UsageResult } from "../../contracts/usage";
import { buildTrayMenuSnapshot } from "./trayMenu";

const NOW = 1_790_000_000_000;
const HOUR = 3_600_000;

function account(id: string, provider: AccountPublic["provider"], label: string): AccountPublic {
  return { id, provider, label, authKind: "local-auto", hasCredential: true, hidden: false };
}

function ok(result: Partial<UsageResult> & Pick<UsageResult, "snapshot">): AccountFetchState {
  return { status: "ok", result: { cached: false, stale: false, ...result } };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("buildTrayMenuSnapshot", () => {
  it("summarises each account by its tightest window and lists every window", () => {
    const claude = account("a", "claude", "Work");
    const snapshot = buildTrayMenuSnapshot([claude], {
      a: ok({
        snapshot: {
          planLabel: "Team",
          fetchedAt: NOW,
          windows: [
            { label: "Current session", usedPercent: 7, resetsAt: NOW + 4 * HOUR },
            { label: "Weekly · all models", usedPercent: 63, resetsAt: NOW + 72 * HOUR },
            { label: "Extra usage", usedPercent: 78, detail: "$1,166.34 of $1,500.00" },
            { label: "Credits", detail: "$20.62" },
          ],
        },
      }),
    });

    expect(snapshot.refreshLabel).toBe("Updated just now");
    expect(snapshot.accounts).toEqual([
      {
        providerTone: "orange",
        title: "Claude · Work",
        subtitle: "Team",
        summary: { label: "Extra usage", usedPercent: 78, tone: "high", text: "78%" },
        alert: undefined,
        rows: [
          { label: "Current session", value: "7% · resets in 4 hr 0 min", usedPercent: 7, tone: "healthy" },
          { label: "Weekly · all models", value: "63% · resets in 3 d 0 hr", usedPercent: 63, tone: "warning" },
          { label: "Extra usage · $1,166.34 of $1,500.00", value: "78%", usedPercent: 78, tone: "high" },
          { label: "Credits", value: "$20.62", tone: "neutral" },
        ],
      },
    ]);
  });

  it("names the window in the summary the way the panel abbreviates it", () => {
    const snapshot = buildTrayMenuSnapshot([account("a", "claude", "")], {
      a: ok({
        snapshot: {
          fetchedAt: NOW,
          windows: [
            { label: "Current session", usedPercent: 7 },
            { label: "Weekly · all models", usedPercent: 63 },
          ],
        },
      }),
    });
    expect(snapshot.accounts[0].title).toBe("Claude");
    expect(snapshot.accounts[0].summary.label).toBe("Weekly");
  });

  it("drops the label when it only repeats the provider name", () => {
    const snapshot = buildTrayMenuSnapshot([account("a", "codex", "codex")], {});
    expect(snapshot.accounts[0].title).toBe("Codex");
  });

  it("shows loading and failure states when there is no usage to fall back on", () => {
    const snapshot = buildTrayMenuSnapshot(
      [account("a", "cursor", "Me"), account("b", "devin", "Team"), account("c", "grok", "X")],
      {
        b: { status: "error", message: "401 Unauthorized" },
        c: { status: "error", message: "fetch failed", offline: true },
      },
    );
    expect(snapshot.refreshLabel).toBe("Updating…");
    expect(snapshot.accounts.map((a) => [a.summary.text, a.alert, a.rows.length])).toEqual([
      ["Loading…", undefined, 0],
      ["Couldn’t load usage", "401 Unauthorized", 0],
      ["Offline", "Check your connection, then try again.", 0],
    ]);
  });

  it("keeps the previous usage through a failed refresh and says so", () => {
    const previous: UsageResult = {
      cached: false,
      stale: false,
      snapshot: { fetchedAt: NOW - 5 * 60_000, windows: [{ label: "Weekly", usedPercent: 95 }] },
    };
    const snapshot = buildTrayMenuSnapshot([account("a", "codex", "Personal")], {
      a: { status: "error", message: "boom", previous },
    });
    expect(snapshot.accounts[0].summary).toEqual({
      label: "Weekly",
      usedPercent: 95,
      tone: "critical",
      text: "95%",
    });
    expect(snapshot.accounts[0].alert).toBe("Couldn’t refresh: boom");
  });

  it("flags cached figures", () => {
    const snapshot = buildTrayMenuSnapshot([account("a", "codex", "Personal")], {
      a: ok({ stale: true, snapshot: { fetchedAt: NOW, windows: [] } }),
    });
    expect(snapshot.accounts[0].summary.text).toBe("—");
    expect(snapshot.accounts[0].alert).toBe("Showing cached usage");
  });
});
