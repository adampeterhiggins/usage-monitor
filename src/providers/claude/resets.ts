/** Claude banked resets (the CLI's `cedar_ember` program). The usage endpoint
 *  lists the grants when asked; claiming one resets the organization's rate
 *  limits. Only OAuth logins can do either — claude.ai session keys cannot. */

import { fetchJson, fetchText } from "../../platform/http";
import type { Account } from "../../contracts/accounts";
import { ResetCreditError, type ResetCredits, type ResetOutcome } from "../../contracts/resets";
import type { UsageFetchHooks } from "../../contracts/usage";
import { resolveClaudeAccessToken } from "./usage";

const API_BASE = "https://api.anthropic.com";
const PROGRAM = "cedar_ember";
// The reset endpoints check for a Claude Code client.
const USER_AGENT = "claude-cli/2.1.283 (external, cli)";
const GRANT_ID = /^[a-z0-9_-]{1,40}$/;
const REQUEST_ID = /^[A-Za-z0-9_-]{1,64}$/;

interface Grant {
  id?: unknown;
  resets_left?: unknown;
  ends_at?: unknown;
  paused?: unknown;
  usable_now?: unknown;
}

interface CedarEmber {
  eligible?: boolean;
  grants?: Grant[] | null;
  next_grant_id?: string | null;
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

/** Grants that are paused, not yet usable, or past `ends_at` do not count. */
export function parseCedarEmber(block: unknown, nowMs: number): ResetCredits {
  const parsed = (block ?? {}) as CedarEmber;
  if (!parsed.eligible) return { availableCount: 0 };
  const live = (parsed.grants ?? []).flatMap((grant) => {
    if (typeof grant.id !== "string" || !GRANT_ID.test(grant.id)) return [];
    if (typeof grant.resets_left !== "number" || grant.resets_left < 0) return [];
    if (grant.paused === true || grant.usable_now !== true) return [];
    const endsAt = typeof grant.ends_at === "string" ? Date.parse(grant.ends_at) : undefined;
    if (endsAt !== undefined && !(endsAt > nowMs)) return [];
    return [{ id: grant.id, resetsLeft: grant.resets_left, endsAt }];
  });
  const next = live.find((grant) => grant.id === parsed.next_grant_id);
  if (!next) return { availableCount: 0 };
  return {
    availableCount: live.reduce((sum, grant) => sum + grant.resetsLeft, 0),
    nextExpiresAt: next.endsAt,
    nextCreditId: next.id,
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
  const data = await fetchJson<{ cedar_ember?: unknown }>(
    `${API_BASE}/api/oauth/usage?cedar_ember=1&skip_spend=1`,
    { headers: headers(token) },
  );
  return parseCedarEmber(data.cedar_ember, Date.now());
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

/** Claims `grantId`. `requestId` is the idempotency key: a retry with the
 *  same id is the same claim. */
export async function consumeClaudeResetCredit(
  account: Account,
  input: { grantId?: string; requestId: string },
  hooks?: UsageFetchHooks,
): Promise<ResetOutcome> {
  if (!input.grantId || !GRANT_ID.test(input.grantId) || !REQUEST_ID.test(input.requestId)) {
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
        body: JSON.stringify({
          program: PROGRAM,
          grant_id: input.grantId,
          request_id: input.requestId,
        }),
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
