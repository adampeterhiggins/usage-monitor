/** Provider service status from public Statuspage APIs and xAI's incident RSS
 *  feed, which also carries Cursor's incidents since Cursor moved to
 *  status.x.ai. Any incident is worth surfacing, not just usage-related
 *  components. */

import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { ProviderId } from "../../contracts/providers";
import { fetchJson, fetchText, HttpError } from "../../platform/http";

export type StatusIndicator = "none" | "minor" | "major" | "critical" | "maintenance";

export interface ProviderStatus {
  indicator: StatusIndicator;
  /** The page's own summary, e.g. "Partially Degraded Service". */
  description: string;
}

/** Explicitly account for every provider. OpenCode has no verified public
 *  status page; do not infer its service health from an authenticated usage call. */
export const STATUS_PAGES: Record<ProviderId, string | null> = {
  claude: "https://status.claude.com",
  codex: "https://status.openai.com",
  cursor: "https://status.x.ai",
  devin: "https://www.devinstatus.com",
  grok: "https://status.x.ai",
  opencode: null,
};

/** Cursor's Statuspage stops being updated on 2026-10-26, and its incidents
 *  only appear on status.x.ai from then on. Read both until the old page is
 *  retired so neither side of the cutover goes unreported. */
const LEGACY_CURSOR_STATUS_PAGE = "https://status.cursor.com";

const INDICATORS: readonly StatusIndicator[] = ["none", "minor", "major", "critical", "maintenance"];
const RANK: Record<StatusIndicator, number> = {
  none: 0, maintenance: 1, minor: 2, major: 3, critical: 4,
};
const ALL_CLEAR: ProviderStatus = { indicator: "none", description: "All Systems Operational" };

const worse = (a: ProviderStatus, b: ProviderStatus) => (RANK[b.indicator] > RANK[a.indicator] ? b : a);

export function parseStatus(body: unknown): ProviderStatus {
  const status = (body as { status?: { indicator?: unknown; description?: unknown } } | null)?.status;
  const indicator = INDICATORS.includes(status?.indicator as StatusIndicator)
    ? (status?.indicator as StatusIndicator)
    : // An indicator we don't know is still something other than "all clear".
      status?.indicator
      ? "minor"
      : null;
  if (!indicator) throw new Error("Status response has no indicator");
  const description =
    typeof status?.description === "string" && status.description.trim()
      ? status.description.trim()
      : indicator === "none"
        ? "All Systems Operational"
        : "Service issue reported";
  return { indicator, description };
}

/** xAI's feed covers every xAI product. Items are titled "[Component] Title"
 *  and linked under a per-component path, e.g. /grok-build/INC…. */
function isCursorIncident(item: { title?: unknown; link?: unknown }): boolean {
  const component = typeof item.title === "string" ? /^\s*\[([^\]]*)\]/.exec(item.title)?.[1] ?? "" : "";
  let section = "";
  try {
    if (typeof item.link === "string") section = new URL(item.link).pathname.split("/")[1] ?? "";
  } catch {
    // A malformed link just leaves the title prefix to decide.
  }
  return /cursor/i.test(component) || /^cursor/i.test(section);
}

/** xAI documents https://status.x.ai/feed.xml. Each incident carries severity
 *  and lifecycle categories; historical resolved incidents must not warn. Only
 *  incidents for the requested product count, so a Cursor outage never shows
 *  as a Grok one or vice versa. */
export function parseXaiStatus(body: string, product: "grok" | "cursor"): ProviderStatus {
  if (XMLValidator.validate(body) !== true) throw new Error("Invalid status feed XML");
  const parsed = new XMLParser({
    parseTagValue: false,
    isArray: (name) => name === "item" || name === "category",
  }).parse(body);
  const channel = parsed?.rss?.channel;
  if (!channel || typeof channel !== "object" || typeof channel.title !== "string") {
    throw new Error("Status response has no RSS channel");
  }
  const severity: Record<string, StatusIndicator> = {
    info: "minor",
    disruption: "minor",
    outage: "major",
    maintenance: "maintenance",
  };
  let result = ALL_CLEAR;
  for (const item of channel.item ?? []) {
    const categories: string[] = (item.category ?? []).map((value: unknown) =>
      typeof value === "string" ? value.trim().toLowerCase() : "",
    );
    if (!categories.some(Boolean)) throw new Error("Status incident has no categories");
    if (categories.includes("resolved")) continue;
    if (isCursorIncident(item) !== (product === "cursor")) continue;
    const reported = categories.reduce<StatusIndicator>(
      (highest, category) => {
        const candidate = severity[category];
        return candidate && RANK[candidate] > RANK[highest] ? candidate : highest;
      },
      "none",
    );
    const indicator = reported === "none" ? "minor" : reported;
    if (RANK[indicator] <= RANK[result.indicator]) continue;
    result = {
      indicator,
      description: typeof item.title === "string" && item.title.trim()
        ? item.title.trim()
        : "Service issue reported",
    };
  }
  return result;
}

async function fetchXaiStatus(page: string, product: "grok" | "cursor"): Promise<ProviderStatus> {
  const response = await fetchText(`${page}/feed.xml`, { headers: { Accept: "application/rss+xml" } });
  if (response.status < 200 || response.status >= 300) {
    throw new HttpError("Couldn’t fetch xAI status feed", response.status);
  }
  return parseXaiStatus(response.body, product);
}

const fetchStatuspage = async (page: string) =>
  parseStatus(await fetchJson<unknown>(`${page}/api/v2/status.json`));

/** Report the worse of the xAI feed and Cursor's old Statuspage; one source
 *  failing must not hide what the other says. */
async function fetchCursorStatus(page: string): Promise<ProviderStatus> {
  const results = await Promise.allSettled([
    fetchXaiStatus(page, "cursor"),
    fetchStatuspage(LEGACY_CURSOR_STATUS_PAGE),
  ]);
  const statuses = results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
  if (!statuses.length) throw (results[0] as PromiseRejectedResult).reason;
  return statuses.reduce(worse);
}

export async function fetchProviderStatus(provider: ProviderId): Promise<ProviderStatus> {
  const page = STATUS_PAGES[provider];
  if (!page) throw new Error("This provider has no status page.");
  if (provider === "grok") return fetchXaiStatus(page, "grok");
  if (provider === "cursor") return fetchCursorStatus(page);
  return fetchStatuspage(page);
}
