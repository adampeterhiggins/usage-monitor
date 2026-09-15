import { readHomeFile } from "../../platform/credentials";
import { fetchJson, HttpError } from "../../platform/http";
import type { Account } from "../../contracts/accounts";
import { authCredential } from "../../contracts/auth";
import type { UsageSnapshot, UsageWindow } from "../../contracts/usage";
import { DEVIN_CLIENT, DEVIN_CREDENTIALS_PATH, devinApiKey } from "./auth";

/**
 * Devin shares a backend with Windsurf/Codeium, so quota lives on a Connect
 * RPC there rather than on the documented `api.devin.ai` surface. The public
 * v3 API only exposes org-wide ACU totals by day, which are the wrong
 * granularity (and the wrong auth model) for a per-account meter.
 */
const USER_STATUS_URL =
  "https://server.codeium.com/exa.seat_management_pb.SeatManagementService/GetUserStatus";

interface DevinPlanInfo {
  planName?: string;
  teamsTier?: string;
  billingStrategy?: string;
  devinInfo?: { accountDisplayName?: string };
}

/** Proto3 JSON: `int64` arrives as a string, `double` as a number, and any
 *  field at its zero value is omitted entirely. */
interface DevinPlanStatus {
  planInfo?: DevinPlanInfo;
  dailyQuotaRemainingPercent?: number;
  weeklyQuotaRemainingPercent?: number;
  dailyQuotaResetAtUnix?: string | number;
  weeklyQuotaResetAtUnix?: string | number;
  overageBalanceMicros?: string | number;
  acuConsumed?: string | number;
  acuLimit?: string | number;
}

interface DevinUserStatusResponse {
  userStatus?: {
    email?: string;
    name?: string;
    teamsTier?: string;
    planStatus?: DevinPlanStatus;
  };
}

function number(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/** Unix seconds → epoch ms. */
function resetMs(value: unknown): number | undefined {
  const seconds = number(value);
  return seconds === undefined ? undefined : seconds * 1000;
}

/**
 * Build one quota meter.
 *
 * The remaining-percent field is **absent when it is zero** — proto3 omits
 * zero values — so a missing percent alongside a live reset timestamp means
 * the quota is fully spent, not that it is unknown. Treating absence as
 * "no data" would blank the meter exactly when it matters most. A window with
 * no reset timestamp at all is a window this plan does not have.
 */
export function quotaWindow(
  label: string,
  remainingPercent: number | undefined,
  resetAtUnix: unknown,
): UsageWindow | undefined {
  const resetsAt = resetMs(resetAtUnix);
  if (resetsAt === undefined && remainingPercent === undefined) return undefined;
  const remaining = remainingPercent ?? 0;
  return { label, usedPercent: Math.min(100, Math.max(0, 100 - remaining)), resetsAt };
}

export function formatDollars(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(2)}`;
}

/** Translate `GetUserStatus` into the app's provider-neutral meters. */
export function snapshotFromUserStatus(data: DevinUserStatusResponse): UsageSnapshot {
  const plan = data.userStatus?.planStatus;
  const windows: UsageWindow[] = [];

  const daily = quotaWindow("Daily", plan?.dailyQuotaRemainingPercent, plan?.dailyQuotaResetAtUnix);
  if (daily) windows.push(daily);
  const weekly = quotaWindow("Weekly", plan?.weeklyQuotaRemainingPercent, plan?.weeklyQuotaResetAtUnix);
  if (weekly) windows.push(weekly);

  const acuConsumed = number(plan?.acuConsumed);
  const acuLimit = number(plan?.acuLimit);
  if (acuConsumed !== undefined && acuLimit !== undefined && acuLimit > 0) {
    windows.push({
      label: "ACUs",
      usedPercent: (acuConsumed / acuLimit) * 100,
      detail: `${acuConsumed} of ${acuLimit}`,
    });
  }

  const overage = number(plan?.overageBalanceMicros);
  if (overage !== undefined && overage > 0) {
    windows.push({ label: "Extra usage balance", detail: formatDollars(overage) });
  }

  if (windows.length === 0) {
    windows.push({ label: "Usage", detail: "No quota data reported" });
  }

  return {
    planLabel: plan?.planInfo?.planName?.trim() || undefined,
    windows,
    fetchedAt: Date.now(),
  };
}

/** Native mode: the key `devin auth login` wrote to the CLI's credentials file. */
async function localApiKey(): Promise<string> {
  let raw: string;
  try {
    raw = await readHomeFile(DEVIN_CREDENTIALS_PATH);
  } catch {
    throw new Error(
      "Devin login not found. Sign in below, run `devin auth login`, or paste an API key.",
    );
  }
  return devinApiKey(raw, `~/${DEVIN_CREDENTIALS_PATH}`);
}

export async function fetchDevinUsage(account: Account): Promise<UsageSnapshot> {
  const pasted = authCredential(account.auth).trim();
  const apiKey = pasted ? devinApiKey(pasted, "Pasted credential") : await localApiKey();

  let data: DevinUserStatusResponse;
  try {
    data = await fetchJson<DevinUserStatusResponse>(USER_STATUS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "connect-protocol-version": "1" },
      body: JSON.stringify({ metadata: { api_key: apiKey, ...DEVIN_CLIENT } }),
    });
  } catch (e) {
    if (e instanceof HttpError && (e.status === 401 || e.status === 403)) {
      throw new Error(
        pasted
          ? "Devin rejected this credential — sign in again on this account, or paste a fresh API key."
          : "Devin rejected the local login — run `devin auth login`, then retry.",
      );
    }
    throw e;
  }

  return snapshotFromUserStatus(data);
}
