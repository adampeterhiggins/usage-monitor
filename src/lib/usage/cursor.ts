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

const PLAN_NAMES: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  pro_plus: "Pro+",
  ultra: "Ultra",
  team: "Team",
  enterprise: "Enterprise",
};

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function ms(iso?: string): number | undefined {
  if (!iso) return undefined;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? undefined : t;
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
