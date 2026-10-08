/** Provider service status from each vendor's public Statuspage API. All of them
 *  serve the Statuspage `/api/v2/status.json` shape (OpenAI's via
 *  incident.io's compatible layer), so one parser covers them. We only read
 *  the page-wide indicator — any incident is worth surfacing, not just ones
 *  tagged to a usage component. */

import type { ProviderId } from "../../contracts/providers";
import { fetchJson } from "../../platform/http";

export type StatusIndicator = "none" | "minor" | "major" | "critical" | "maintenance";

export interface ProviderStatus {
  indicator: StatusIndicator;
  /** The page's own summary, e.g. "Partially Degraded Service". */
  description: string;
}

/** Neither xAI nor OpenCode publishes a Statuspage-compatible API. */
export const STATUS_PAGES: Partial<Record<ProviderId, string>> = {
  claude: "https://status.claude.com",
  codex: "https://status.openai.com",
  cursor: "https://status.cursor.com",
  devin: "https://www.devinstatus.com",
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

export async function fetchProviderStatus(provider: ProviderId): Promise<ProviderStatus> {
  const page = STATUS_PAGES[provider];
  if (!page) throw new Error("This provider has no status page.");
  return parseStatus(await fetchJson<unknown>(`${page}/api/v2/status.json`));
}
