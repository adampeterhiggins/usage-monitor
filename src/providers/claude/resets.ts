/** Claude usage resets. Two programs share one claim endpoint: `cedar_ember`
 *  banks grants (a "Full reset", a "5-hour reset", …), each refilling the
 *  limits its `clears` names; `juniper_tide` offers a weekly session-limit
 *  reset while the account is at its 5-hour limit. The usage endpoint lists
 *  both when asked. Only OAuth logins can read or claim them — claude.ai
 *  session keys cannot. */

import { fetchJson, fetchText } from "../../platform/http";
import type { Account } from "../../contracts/accounts";
import {
  bySoonestExpiry,
  ResetCreditError,
  type ResetCredit,
  type ResetCredits,
  type ResetOutcome,
} from "../../contracts/resets";
import type { UsageFetchHooks } from "../../contracts/usage";
import { resolveClaudeAccessToken } from "./usage";

const API_BASE = "https://api.anthropic.com";
const PROGRAM = "cedar_ember";
const SESSION_PROGRAM = "juniper_tide";
/** The credit id of the session-limit reset. Grant ids cannot hold a colon. */
export const SESSION_RESET_ID = "juniper_tide:session";
// The reset endpoints check for a Claude Code client.
const USER_AGENT = "claude-cli/2.1.283 (external, cli)";
const GRANT_ID = /^[a-z0-9_-]{1,40}$/;
const REQUEST_ID = /^[A-Za-z0-9_-]{1,64}$/;

// The limits a reset can refill, by Claude's name for them. Limits missing
// here are still refilled; they are just not named.
const LIMIT_NAMES: Record<string, string> = {
  five_hour: "5-hour",
  seven_day: "weekly",
  seven_day_opus: "Opus weekly",
  seven_day_sonnet: "Sonnet weekly",
  seven_day_cowork: "Cowork weekly",
};

interface Grant {
  id?: unknown;
  label?: unknown;
  resets_left?: unknown;
  starts_at?: unknown;
  ends_at?: unknown;
  clears?: unknown;
  paused?: unknown;
  usable_now?: unknown;
  use_requires_limit?: unknown;
}

interface CedarEmber {
  eligible?: boolean;
  grants?: Grant[] | null;
  next_grant_id?: string | null;
  /** The limits the account is at right now. */
  exhausted?: unknown;
}

interface JuniperTide {
  eligible?: unknown;
  /** The experiment arm; only `reset` is offered the reset. */
  arm?: unknown;
  available?: unknown;
  next_available_at?: unknown;
}

type ClaimResult =
  | "reset"
  | "already_used"
  | "not_limited"
  | "cooldown"
  | "ineligible"
  | "unavailable";

const CLAIM_OUTCOMES: Partial<Record<ClaimResult, ResetOutcome>> = {
  reset: "reset",
  not_limited: "nothingToReset",
  already_used: "alreadyRedeemed",
  ineligible: "noCredit",
};

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "anthropic-beta": "oauth-2025-04-20",
    "User-Agent": USER_AGENT,
    "Content-Type": "application/json",
  };
}

function stringList(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : undefined;
}

function listJoin(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "5-hour and weekly limits", or undefined when none of `limits` has a name. */
function limitNames(limits: string[]): string | undefined {
  const names = limits.flatMap((limit) => LIMIT_NAMES[limit] ?? []);
  if (names.length === 0) return undefined;
  return `${listJoin(names)} ${names.length === 1 ? "limit" : "limits"}`;
}

function grantTitle(label: unknown, clears: string[]): string | undefined {
  if (typeof label === "string" && label.trim()) return label.trim();
  const session = clears.includes("five_hour");
  const weekly = clears.some((limit) => limit.startsWith("seven_day"));
  if (session && weekly) return "Full reset";
  if (session) return "5-hour reset";
  if (weekly) return "Weekly reset";
  return undefined;
}

/** Why a banked grant cannot help right now. Like the CLI, a grant that must
 *  be used at a limit is held back unless it refills a limit the account is
 *  at; when Claude does not say which limits those are, the claim decides. */
function limitBlock(grant: Grant, clears: string[], exhausted?: string[]): string | undefined {
  if (!exhausted || clears.length === 0 || grant.use_requires_limit === false) return undefined;
  if (clears.some((limit) => exhausted.includes(limit))) return undefined;
  if (exhausted.length === 0) return "for use at a usage limit";
  const names = limitNames(exhausted);
  return names ? `doesn't refill your ${names}` : "doesn't cover the limit you're at";
}

function parseTime(value: unknown): number | undefined {
  const ms = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(ms) ? ms : undefined;
}

/** Expired, empty, and malformed grants are dropped. Paused and not-yet-
 *  started grants are listed but not counted; grants that do not cover the
 *  limit the account is at are counted but cannot be used. */
export function parseCedarEmber(block: unknown, nowMs: number): ResetCredits {
  const parsed = (block ?? {}) as CedarEmber;
  if (!parsed.eligible) return { availableCount: 0, credits: [] };
  const exhausted = stringList(parsed.exhausted);
  const banked = new Set<string>();
  const grants: ResetCredit[] = (parsed.grants ?? []).flatMap((grant) => {
    if (typeof grant.id !== "string" || !GRANT_ID.test(grant.id)) return [];
    if (typeof grant.resets_left !== "number" || grant.resets_left <= 0) return [];
    const expiresAt = parseTime(grant.ends_at);
    if (expiresAt !== undefined && !(expiresAt > nowMs)) return [];
    const clears = stringList(grant.clears) ?? [];
    const startsAt = parseTime(grant.starts_at);
    const startsLater = startsAt !== undefined && startsAt > nowMs;
    const held =
      grant.paused === true
        ? "paused"
        : grant.usable_now !== true
          ? "not usable yet"
          : undefined;
    if (!held) banked.add(grant.id);
    const blockedReason = held ?? limitBlock(grant, clears, exhausted);
    return [
      {
        id: grant.id,
        resetsLeft: grant.resets_left,
        expiresAt,
        title: grantTitle(grant.label, clears),
        refills: limitNames(clears),
        usable: !blockedReason,
        blockedReason,
        usableAt: held === "not usable yet" && startsLater ? startsAt : undefined,
      },
    ];
  });
  grants.sort(bySoonestExpiry);
  const next = grants.find((grant) => grant.usable && grant.id === parsed.next_grant_id);
  return {
    availableCount: grants.reduce(
      (sum, grant) => sum + (banked.has(grant.id) ? grant.resetsLeft : 0),
      0,
    ),
    nextExpiresAt: (next ?? grants.find((grant) => banked.has(grant.id)))?.expiresAt,
    nextCreditId: next?.id,
    credits: grants,
  };
}

/** The session-limit reset, when Claude offers one: listed while it is used
 *  up for the week, counted and usable when it is available. */
export function parseJuniperTide(block: unknown, nowMs: number): ResetCredit | undefined {
  const parsed = (block ?? {}) as JuniperTide;
  if (parsed.eligible !== true || parsed.arm !== "reset") return undefined;
  const usable = parsed.available === true;
  const usableAt = parseTime(parsed.next_available_at);
  return {
    id: SESSION_RESET_ID,
    resetsLeft: 1,
    title: "5-hour reset",
    refills: limitNames(["five_hour"]),
    usable,
    blockedReason: usable ? undefined : "used this week",
    usableAt: !usable && usableAt !== undefined && usableAt > nowMs ? usableAt : undefined,
  };
}

export function withSessionReset(credits: ResetCredits, session?: ResetCredit): ResetCredits {
  if (!session) return credits;
  return {
    ...credits,
    availableCount: credits.availableCount + (session.usable ? 1 : 0),
    credits: [...credits.credits, session],
  };
}

async function requireToken(account: Account, hooks?: UsageFetchHooks): Promise<string> {
  const token = await resolveClaudeAccessToken(account, hooks);
  if (!token) {
    throw new ResetCreditError(
      "Usage resets need a Claude sign-in. This account uses a claude.ai session key — sign in again from Edit.",
      true,
    );
  }
  return token;
}

export async function fetchClaudeResetCredits(
  account: Account,
  hooks?: UsageFetchHooks,
): Promise<ResetCredits> {
  const token = await requireToken(account, hooks);
  const [banked, atLimit] = await Promise.all([
    fetchJson<{ cedar_ember?: unknown }>(
      `${API_BASE}/api/oauth/usage?cedar_ember=1&skip_spend=1`,
      { headers: headers(token) },
    ),
    // The session reset only comes back from the read the CLI makes at a
    // usage limit. Without it the banked grants still list.
    fetchJson<{ juniper_tide?: unknown }>(`${API_BASE}/api/oauth/usage?at_wall=1&skip_spend=1`, {
      headers: headers(token),
    }).catch(() => undefined),
  ]);
  const now = Date.now();
  return withSessionReset(
    parseCedarEmber(banked.cedar_ember, now),
    parseJuniperTide(atLimit?.juniper_tide, now),
  );
}

async function organizationUuid(token: string): Promise<string> {
  const profile = await fetchJson<{ organization?: { uuid?: string } }>(
    `${API_BASE}/api/oauth/profile`,
    { headers: headers(token) },
  ).catch((e) => {
    throw new ResetCreditError(
      `Claude could not read its account. ${e instanceof Error ? e.message : ""}`.trim(),
      true,
    );
  });
  const uuid = profile.organization?.uuid?.trim();
  if (!uuid) throw new ResetCreditError("Sign in to Claude again to redeem resets.", true);
  return uuid;
}

/** Claims `grantId`, or the session reset for `SESSION_RESET_ID`.
 *  `requestId` is the idempotency key for a grant: a retry with the same id
 *  is the same claim. The session reset takes no key; Claude allows one a
 *  week, so a repeat claim answers `already_used`. */
export async function consumeClaudeResetCredit(
  account: Account,
  input: { grantId?: string; requestId: string },
  hooks?: UsageFetchHooks,
): Promise<ResetOutcome> {
  const session = input.grantId === SESSION_RESET_ID;
  const grantValid =
    !!input.grantId && GRANT_ID.test(input.grantId) && REQUEST_ID.test(input.requestId);
  if (!session && !grantValid) {
    throw new ResetCreditError("Claude returned a malformed reset credit.", true);
  }
  const token = await requireToken(account, hooks);
  const organization = await organizationUuid(token);

  let res: Awaited<ReturnType<typeof fetchText>>;
  try {
    res = await fetchText(
      `${API_BASE}/api/organizations/${encodeURIComponent(organization)}/reset_rate_limits`,
      {
        method: "POST",
        headers: { ...headers(token), Accept: "application/json" },
        body: JSON.stringify(
          session
            ? { program: SESSION_PROGRAM }
            : { program: PROGRAM, grant_id: input.grantId, request_id: input.requestId },
        ),
      },
    );
  } catch {
    throw new ResetCreditError("Claude could not redeem the reset.", false);
  }
  if (res.status === 429) {
    throw new ResetCreditError("Claude is rate limiting resets. Try again soon.", true);
  }
  if (res.status === 401 || res.status === 403) {
    throw new ResetCreditError("Sign in to Claude again to redeem resets.", true);
  }
  let result: ClaimResult | undefined;
  if (res.status >= 200 && res.status < 300) {
    try {
      result = (JSON.parse(res.body) as { result?: ClaimResult }).result;
    } catch {
      result = undefined;
    }
  }
  if (result === "cooldown") {
    throw new ResetCreditError("Claude resets are cooling down. Try again later.", true);
  }
  // Claude could not say whether the claim landed, so, like the CLI, keep the
  // request id and let the retry ask about the same claim.
  if (result === "unavailable") {
    throw new ResetCreditError(
      "Claude could not confirm the reset. If you are still limited in a moment, try again.",
      false,
    );
  }
  const outcome = result ? CLAIM_OUTCOMES[result] : undefined;
  if (!outcome) throw new ResetCreditError("Claude could not redeem the reset.", false);
  return outcome;
}
