/** Codex rate-limit reset credits, read and redeemed through the same ChatGPT
 *  backend endpoints the Codex CLI's app-server calls. */

import { fetchJson } from "../../platform/http";
import type { Account } from "../../contracts/accounts";
import { ResetCreditError, type ResetCredits, type ResetOutcome } from "../../contracts/resets";
import type { UsageFetchHooks } from "../../contracts/usage";
import { codexHeaders, withCodexCreds } from "./usage";

const CREDITS_URL = "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits";
const CONSUME_URL = `${CREDITS_URL}/consume`;

export interface CodexResetCreditsResponse {
  available_count?: number | null;
  credits?: Array<{
    id?: string;
    status?: string;
    expires_at?: string | null;
  }> | null;
}

const CONSUME_OUTCOMES: Record<string, ResetOutcome> = {
  reset: "reset",
  nothing_to_reset: "nothingToReset",
  no_credit: "noCredit",
  already_redeemed: "alreadyRedeemed",
};

export function parseCodexResetCredits(data: CodexResetCreditsResponse): ResetCredits {
  const expiries = (data.credits ?? [])
    .filter((credit) => credit.status === "available" && credit.expires_at)
    .map((credit) => Date.parse(credit.expires_at!))
    .filter((value) => Number.isFinite(value));
  return {
    availableCount: Math.max(0, data.available_count ?? 0),
    nextExpiresAt: expiries.length > 0 ? Math.min(...expiries) : undefined,
  };
}

export async function fetchCodexResetCredits(
  account: Account,
  hooks?: UsageFetchHooks,
): Promise<ResetCredits> {
  const data = await withCodexCreds(account, hooks, (creds) =>
    fetchJson<CodexResetCreditsResponse>(CREDITS_URL, {
      headers: { ...codexHeaders(creds), "User-Agent": "codex-cli" },
    }),
  );
  return parseCodexResetCredits(data);
}

/** `requestId` is the idempotency key: reuse it when retrying one attempt. */
export async function consumeCodexResetCredit(
  account: Account,
  input: { requestId: string },
  hooks?: UsageFetchHooks,
): Promise<ResetOutcome> {
  let data: { code?: string };
  try {
    data = await withCodexCreds(account, hooks, (creds) =>
      fetchJson<{ code?: string }>(CONSUME_URL, {
        method: "POST",
        headers: {
          ...codexHeaders(creds),
          "User-Agent": "codex-cli",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ redeem_request_id: input.requestId }),
      }),
    );
  } catch (e) {
    throw new ResetCreditError(
      `Codex could not redeem the reset. ${e instanceof Error ? e.message : ""}`.trim(),
      false,
    );
  }
  const outcome = data.code ? CONSUME_OUTCOMES[data.code] : undefined;
  if (!outcome) throw new ResetCreditError("Codex could not confirm the reset. Try again.", false);
  return outcome;
}
