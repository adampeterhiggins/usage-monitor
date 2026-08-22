import { fetchJson } from "../http";
import type { Account, UsageSnapshot, UsageWindow } from "../usage-types";

interface CursorUsageSummary {
  billingCycleStart?: string;
  billingCycleEnd?: string;
  membershipType?: string;
  isUnlimited?: boolean;
  individualUsage?: {
    plan?: {
      enabled?: boolean;
      used?: number;
      limit?: number | null;
      autoPercentUsed?: number | null;
      apiPercentUsed?: number | null;
      totalPercentUsed?: number | null;
    };
    onDemand?: { enabled?: boolean; used?: number; limit?: number | null };
  };
  teamUsage?: {
    onDemand?: { enabled?: boolean; used?: number; limit?: number | null };
  };
}

interface GrokBotUsage {
  usedPercent: number;
  resetsAt?: number;
}

interface CursorGrokBotUsageResponse {
  usagePercent?: number;
  nextResetTimestampUtc?: string;
  hasAvailableUsage?: boolean;
  hasNonZeroIncludedLimit?: boolean;
  grokPlanLabel?: string;
}

const PLAN_NAMES: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  pro_plus: "Pro+",
  ultra: "Ultra",
  team: "Team",
  enterprise: "Enterprise",
};

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function ms(value?: string | number | null): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const t = typeof value === "number" ? (value < 10_000_000_000 ? value * 1000 : value) : new Date(value).getTime();
  return Number.isNaN(t) ? undefined : t;
}

function number(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/**
 * Grok Bot is exposed by Cursor's dashboard response, but the response is an
 * undocumented/private API and its nesting has changed as the product has
 * rolled out. Find a metric object only when it lives below a Grok/Bot-ish
 * key, so an unrelated weekly field cannot be mistaken for this meter.
 */
function findGrokBotUsage(value: unknown, path: string[] = []): GrokBotUsage | undefined {
  if (!value || typeof value !== "object") return undefined;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findGrokBotUsage(item, path);
      if (found) return found;
    }
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const pathLooksLikeGrokBot = path.some((part) => {
    const key = part.toLowerCase().replace(/[^a-z0-9]/g, "");
    return key.includes("grok") || key.includes("bot");
  });
  if (pathLooksLikeGrokBot) {
    const usedPercent =
      number(record.usedPercent) ?? number(record.percentUsed) ?? number(record.usagePercent) ?? number(record.percent);
    const used = number(record.used);
    const limit = number(record.limit) ?? number(record.total);
    const derivedPercent = used !== undefined && limit !== undefined && limit > 0 ? (used / limit) * 100 : undefined;
    const percent = usedPercent ?? derivedPercent;
    if (percent !== undefined && percent >= 0) {
      const resetValue =
        record.resetsAt ?? record.resetAt ?? record.nextResetAt ?? record.weekEnd ?? record.resetDate;
      return { usedPercent: percent, resetsAt: ms(typeof resetValue === "string" || typeof resetValue === "number" ? resetValue : undefined) };
    }
  }

  for (const [key, child] of Object.entries(record)) {
    const found = findGrokBotUsage(child, [...path, key]);
    if (found) return found;
  }
  return undefined;
}

async function fetchGrokBotUsage(headers: Record<string, string>): Promise<GrokBotUsage | undefined> {
  try {
    const data = await fetchJson<CursorGrokBotUsageResponse>("https://cursor.com/api/dashboard/get-sand-usage-status", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: "{}",
    });
    if (data.usagePercent === undefined || data.usagePercent === null) return undefined;
    if (data.hasNonZeroIncludedLimit === false && data.hasAvailableUsage === false) return undefined;
    return { usedPercent: data.usagePercent, resetsAt: ms(data.nextResetTimestampUtc) };
  } catch {
    // Grok Bot access is optional; an unavailable secondary endpoint must not
    // hide the normal Cursor Models / Other Models usage meters.
    return undefined;
  }
}

export async function fetchCursorUsage(account: Account): Promise<UsageSnapshot> {
  const token = account.credential.trim();
  const headers = {
    Cookie: `WorkosCursorSessionToken=${token}`,
    Origin: "https://cursor.com",
    Referer: "https://cursor.com/dashboard?tab=usage",
  };

  let data: CursorUsageSummary;
  try {
    data = await fetchJson<CursorUsageSummary>("https://cursor.com/api/usage-summary", { headers });
  } catch (e) {
    if (e instanceof Error && /HTTP 401|not_authenticated/.test(e.message)) {
      throw new Error(
        "Cursor session expired — copy a fresh `WorkosCursorSessionToken` cookie from cursor.com and edit this account.",
      );
    }
    throw e;
  }

  const windows: UsageWindow[] = [];
  const resetsAt = ms(data.billingCycleEnd);
  const plan = data.individualUsage?.plan;

  if (plan?.autoPercentUsed !== undefined && plan?.autoPercentUsed !== null) {
    windows.push({ label: "Cursor Models", usedPercent: plan.autoPercentUsed, resetsAt });
  }
  if (plan?.apiPercentUsed !== undefined && plan?.apiPercentUsed !== null) {
    windows.push({ label: "Other Models", usedPercent: plan.apiPercentUsed, resetsAt });
  }

  const grokBot = (await fetchGrokBotUsage(headers)) ?? findGrokBotUsage(data);
  if (grokBot) {
    windows.push({ label: "Grok Bot", usedPercent: grokBot.usedPercent, resetsAt: grokBot.resetsAt, detail: "weekly" });
  }
  if (windows.length === 0 && plan?.totalPercentUsed !== undefined && plan?.totalPercentUsed !== null) {
    windows.push({ label: "Included usage", usedPercent: plan.totalPercentUsed, resetsAt });
  }
  if (windows.length === 0 && plan?.used !== undefined && plan?.limit) {
    windows.push({
      label: "Included usage",
      usedPercent: (plan.used / plan.limit) * 100,
      resetsAt,
      detail: `${dollars(plan.used)} of ${dollars(plan.limit)}`,
    });
  }

  const onDemand = data.individualUsage?.onDemand;
  if (onDemand?.enabled && onDemand.used !== undefined) {
    windows.push({
      label: "On-demand spend",
      usedPercent: onDemand.limit ? (onDemand.used / onDemand.limit) * 100 : undefined,
      detail: onDemand.limit
        ? `${dollars(onDemand.used)} of ${dollars(onDemand.limit)}`
        : `${dollars(onDemand.used)} (no cap)`,
    });
  }
  const teamOnDemand = data.teamUsage?.onDemand;
  if (teamOnDemand?.enabled && teamOnDemand.used !== undefined && teamOnDemand.limit) {
    windows.push({
      label: "Team on-demand",
      usedPercent: (teamOnDemand.used / teamOnDemand.limit) * 100,
      detail: `${dollars(teamOnDemand.used)} of ${dollars(teamOnDemand.limit)}`,
    });
  }
  if (windows.length === 0) {
    windows.push({
      label: "Usage",
      detail: data.isUnlimited ? "Unlimited plan" : "No usage data reported",
    });
  }

  const planName = data.membershipType ? (PLAN_NAMES[data.membershipType] ?? data.membershipType) : undefined;
  return { planLabel: planName, windows, fetchedAt: Date.now() };
}
