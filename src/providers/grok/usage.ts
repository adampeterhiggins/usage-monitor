import { readHomeFile } from "../../platform/credentials";
import { fetchJson, HttpError } from "../../platform/http";
import type { Account } from "../../contracts/accounts";
import { authCredential } from "../../contracts/auth";
import type { UsageSnapshot, UsageWindow } from "../../contracts/usage";
import { GROK_AUTH_PATH, grokCredential, grokTokenExpired } from "./auth";

/** The billing read the Grok CLI's `/usage` makes. T3 Code reads the same. */
const BILLING_URL = "https://cli-chat-proxy.grok.com/v1/billing?format=credits";

interface GrokAmount {
  val?: number;
}

export interface GrokBillingResponse {
  config?: {
    creditUsagePercent?: number;
    currentPeriod?: { type?: string; start?: string; end?: string };
    onDemandCap?: GrokAmount;
    onDemandUsed?: GrokAmount;
  };
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/** Translate the billing reply into the app's provider-neutral meters. */
export function snapshotFromBilling(data: GrokBillingResponse): UsageSnapshot {
  const config = data.config;
  const windows: UsageWindow[] = [];

  const period = config?.currentPeriod;
  const periodType = period?.type?.replace(/^USAGE_PERIOD_TYPE_/, "");
  const label = periodType === "WEEKLY" ? "Weekly" : periodType === "MONTHLY" ? "Monthly" : "Subscription";
  const resetsAt = period?.end ? Date.parse(period.end) : NaN;
  const usedPercent = finite(config?.creditUsagePercent);
  // xAI omits `creditUsagePercent` (rather than sending 0) until usage
  // registers in the period. With a live period that is an untouched quota,
  // not a missing one — blanking it would hide a freshly reset account.
  if (usedPercent !== undefined || period?.end) {
    windows.push({
      label,
      usedPercent: clampPercent(usedPercent ?? 0),
      resetsAt: Number.isFinite(resetsAt) ? resetsAt : undefined,
    });
  }

  // Pay-as-you-go spend past the subscription. Only the ratio is shown: the
  // reply does not say which unit `val` is in.
  const cap = finite(config?.onDemandCap?.val);
  const used = finite(config?.onDemandUsed?.val) ?? 0;
  if (cap !== undefined && cap > 0) {
    windows.push({ label: "On-demand", usedPercent: clampPercent((used / cap) * 100) });
  }

  if (windows.length === 0) {
    windows.push({ label: "Usage", detail: "No quota data reported" });
  }

  return { windows, fetchedAt: Date.now() };
}

/** Native mode: the login `grok login` wrote to the CLI's auth file. */
async function localCredential() {
  let raw: string;
  try {
    raw = await readHomeFile(GROK_AUTH_PATH);
  } catch {
    throw new Error("Grok login not found. Run `grok login`, or paste an access token.");
  }
  return grokCredential(raw, `~/${GROK_AUTH_PATH}`);
}

export async function fetchGrokUsage(account: Account): Promise<UsageSnapshot> {
  const pasted = authCredential(account.auth).trim();
  const { token } = pasted ? grokCredential(pasted, "Pasted credential") : await localCredential();

  let data: GrokBillingResponse;
  try {
    data = await fetchJson<GrokBillingResponse>(BILLING_URL, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (e) {
    if (e instanceof HttpError && (e.status === 401 || e.status === 403)) {
      // The CLI refreshes its short-lived token on use, so an idle CLI is the
      // usual cause. Refreshing here would rotate the CLI's refresh token.
      if (!pasted && grokTokenExpired(token)) {
        throw new Error("The Grok CLI login has expired — run `grok` once to refresh it, then retry.");
      }
      throw new Error(
        pasted
          ? "Grok rejected this token — paste a fresh one from ~/.grok/auth.json."
          : "Grok rejected the local login — run `grok login`, then retry.",
      );
    }
    throw e;
  }
  return snapshotFromBilling(data);
}
