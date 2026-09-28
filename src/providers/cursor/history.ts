/** Cursor account usage history from the dashboard's usage-events API,
 *  ported from t3code's `cursorUsageReader`. Dashboard events cover every
 *  surface on the account (desktop, CLI, background agents) and report
 *  fresh input separately from cache reads, with Cursor's own charge. */

import { fetchJson, HttpError } from "../../platform/http";
import type { UsageTokenTotals } from "../../contracts/usageHistory";

export interface CursorUsageEvent {
  timestampMs: number;
  model: string;
  /** Base-model key for the rate table. */
  rateModel: string;
  sessionId: string;
  totals: UsageTokenTotals;
  /** Cursor's own charge for the request; `null` when it reported none. */
  reportedCostUsd: number | null;
}

const EVENTS_URL = "https://cursor.com/api/dashboard/get-filtered-usage-events";
const PAGE_SIZE = 1000;

/** Maps Cursor's tiered names (`cursor-grok-4.6-high-fast`,
 *  `claude-fable-5-1-thinking-high`) to the base model's rate-table key.
 *  Grok resolves through xAI's first-party entry, which has no bare alias. */
export function cursorRateModel(model: string): string {
  const base = model
    .replace(/^cursor-/, "")
    .replace(/(?:-thinking)?(?:-(?:none|minimal|low|medium|high|xhigh|max))?(?:-fast)?$/, "");
  return base.startsWith("grok-") ? `xai/${base}` : base;
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function tokens(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** Longest exact suffix-of-`previous` / prefix-of-`current` overlap, in
 *  linear time (KMP failure function over `current ⧺ sentinel ⧺ previous`). */
export function boundaryOverlap(previous: readonly string[], current: readonly string[]): number {
  const sequence = [...current, "\u0000", ...previous];
  const lengths = Array.from({ length: sequence.length }, () => 0);
  for (let index = 1; index < sequence.length; index += 1) {
    let length = lengths[index - 1];
    while (length > 0 && sequence[index] !== sequence[length]) length = lengths[length - 1];
    if (sequence[index] === sequence[length]) length += 1;
    lengths[index] = length;
  }
  return lengths[lengths.length - 1] ?? 0;
}

export class CursorHistoryAuthError extends Error {}

/**
 * Every usage event on the account between `sinceMs` and `untilMs`.
 *
 * Pages can shift while being read (new events push rows down), so a page
 * may repeat the previous page's tail. `totalUsageEventsCount` says how
 * many rows are real; the surplus is removed where page boundaries overlap
 * exactly, and anything else inconsistent fails the read rather than
 * double counting.
 */
export async function fetchCursorUsageEvents(
  cookie: string,
  sinceMs: number,
  untilMs: number,
): Promise<CursorUsageEvent[]> {
  const pages: unknown[][] = [];
  let total: number | undefined;
  for (let page = 1; ; page += 1) {
    if (page > (total === undefined ? 1000 : Math.ceil(total / PAGE_SIZE) * 2 + 1)) {
      throw new Error("Cursor usage history ran past its page limit.");
    }
    let body: Record<string, unknown>;
    try {
      body = object(
        await fetchJson<unknown>(EVENTS_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `WorkosCursorSessionToken=${cookie}`,
            Origin: "https://cursor.com",
            Referer: "https://cursor.com/dashboard?tab=usage",
          },
          body: JSON.stringify({
            page,
            pageSize: PAGE_SIZE,
            startDate: String(sinceMs),
            endDate: String(untilMs),
          }),
        }),
      );
    } catch (error) {
      if (error instanceof HttpError && (error.status === 401 || error.status === 403)) {
        throw new CursorHistoryAuthError("Cursor session expired — sign in again to read its history.");
      }
      throw error;
    }
    if ("error" in body || "message" in body || "code" in body) {
      throw new Error("Cursor returned an error for usage history.");
    }
    const keys = Object.keys(body);
    const count = keys.length === 0 ? 0 : body.totalUsageEventsCount;
    const events =
      keys.length === 0 || (keys.length === 1 && keys[0] === "totalUsageEventsCount")
        ? []
        : body.usageEventsDisplay;
    if (
      (count !== undefined &&
        (typeof count !== "number" ||
          !Number.isSafeInteger(count) ||
          count < 0 ||
          (total !== undefined && count !== total))) ||
      !Array.isArray(events) ||
      events.length > PAGE_SIZE
    ) {
      throw new Error("Cursor returned an inconsistent usage history page.");
    }
    if (typeof count === "number") total = count;
    pages.push(events);
    if (events.length < PAGE_SIZE) break;
  }

  const rawCount = pages.reduce((sum, page) => sum + page.length, 0);
  if (total !== undefined && rawCount < total) {
    throw new Error("Cursor usage history pages were incomplete.");
  }
  let removalsRemaining = total === undefined ? 0 : rawCount - total;
  let previousKeys: string[] = [];
  const events: CursorUsageEvent[] = [];
  for (const page of pages) {
    const pageKeys = removalsRemaining > 0 ? page.map(canonicalJson) : [];
    const removals = Math.min(removalsRemaining, boundaryOverlap(previousKeys, pageKeys));
    removalsRemaining -= removals;
    previousKeys = pageKeys;
    for (const raw of page.slice(removals)) {
      const event = object(raw);
      if (event.tokenUsage === undefined || event.tokenUsage === null) continue;
      const usage = object(event.tokenUsage);
      for (const key of ["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens", "totalCents"]) {
        const value = usage[key];
        if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
          throw new Error("Cursor returned invalid usage totals.");
        }
      }
      const timestampMs =
        typeof event.timestamp === "string" && event.timestamp.trim() !== ""
          ? Number(event.timestamp)
          : event.timestamp;
      if (
        typeof timestampMs !== "number" ||
        !Number.isFinite(timestampMs) ||
        typeof event.model !== "string" ||
        !event.model
      ) {
        throw new Error("Cursor returned an invalid usage event.");
      }
      if (timestampMs < sinceMs || timestampMs > untilMs) continue;
      events.push({
        timestampMs,
        model: event.model,
        rateModel: cursorRateModel(event.model),
        sessionId: typeof event.conversationId === "string" ? event.conversationId : "",
        totals: {
          uncachedInputTokens: tokens(usage.inputTokens),
          cachedInputTokens: tokens(usage.cacheReadTokens),
          cacheCreationTokens: tokens(usage.cacheWriteTokens),
          outputTokens: tokens(usage.outputTokens),
          reasoningTokens: 0,
        },
        reportedCostUsd: typeof usage.totalCents === "number" ? usage.totalCents / 100 : null,
      });
    }
  }
  if (removalsRemaining !== 0) {
    throw new Error("Cursor usage history page boundaries did not reconcile.");
  }
  return events;
}
