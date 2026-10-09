/** Provider service status from public Statuspage APIs and xAI's incident RSS
 *  feed. Any incident is worth surfacing, not just usage-related components. */

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
  cursor: "https://status.cursor.com",
  devin: "https://www.devinstatus.com",
  grok: "https://status.x.ai",
  opencode: null,
};

const INDICATORS: readonly StatusIndicator[] = ["none", "minor", "major", "critical", "maintenance"];

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

/** xAI documents https://status.x.ai/feed.xml. Each incident carries severity
 *  and lifecycle categories; historical resolved incidents must not warn. */
export function parseGrokStatus(body: string): ProviderStatus {
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
  const rank: Record<StatusIndicator, number> = {
    none: 0, maintenance: 1, minor: 2, major: 3, critical: 4,
  };
  let result: ProviderStatus = { indicator: "none", description: "All Systems Operational" };
  for (const item of channel.item ?? []) {
    const categories: string[] = (item.category ?? []).map((value: unknown) =>
      typeof value === "string" ? value.trim().toLowerCase() : "",
    );
    if (!categories.some(Boolean)) throw new Error("Status incident has no categories");
    if (categories.includes("resolved")) continue;
    const reported = categories.reduce<StatusIndicator>(
      (highest, category) => {
        const candidate = severity[category];
        return candidate && rank[candidate] > rank[highest] ? candidate : highest;
      },
      "none",
    );
    const indicator = reported === "none" ? "minor" : reported;
    if (rank[indicator] <= rank[result.indicator]) continue;
    result = {
      indicator,
      description: typeof item.title === "string" && item.title.trim()
        ? item.title.trim()
        : "Service issue reported",
    };
  }
  return result;
}

export async function fetchProviderStatus(provider: ProviderId): Promise<ProviderStatus> {
  const page = STATUS_PAGES[provider];
  if (!page) throw new Error("This provider has no status page.");
  if (provider === "grok") {
    const response = await fetchText(`${page}/feed.xml`, { headers: { Accept: "application/rss+xml" } });
    if (response.status < 200 || response.status >= 300) {
      throw new HttpError("Couldn’t fetch Grok status feed", response.status);
    }
    return parseGrokStatus(response.body);
  }
  return parseStatus(await fetchJson<unknown>(`${page}/api/v2/status.json`));
}
