/** Codex rate-limit reset credits, read and redeemed through the same ChatGPT
 *  backend endpoints the Codex CLI's app-server calls. */

import { fetchJson } from "../../platform/http";
import type { Account } from "../../contracts/accounts";
import {
  bySoonestExpiry,
  ResetCreditError,
  type ResetCredit,
  type ResetCredits,
  type ResetOutcome,
} from "../../contracts/resets";
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
    title?: string | null;
  }> | null;
}

const CONSUME_OUTCOMES: Record<string, ResetOutcome> = {
  reset: "reset",
  nothing_to_reset: "nothingToReset",
  no_credit: "noCredit",
  already_redeemed: "alreadyRedeemed",
};

export function parseCodexResetCredits(data: CodexResetCreditsResponse): ResetCredits {
  const credits: ResetCredit[] = (data.credits ?? []).flatMap((credit) => {
    if (credit.status !== "available" || !credit.id) return [];
    const expiresAt = credit.expires_at ? Date.parse(credit.expires_at) : NaN;
    return [
      {
        id: credit.id,
        resetsLeft: 1,
        expiresAt: Number.isFinite(expiresAt) ? expiresAt : undefined,
        title: credit.title?.trim() || undefined,
        usable: true,
      },
    ];
  });
  credits.sort(bySoonestExpiry);
  return {
    availableCount: Math.max(0, data.available_count ?? 0),
    nextExpiresAt: credits.find((credit) => credit.expiresAt !== undefined)?.expiresAt,
    credits,
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

/** `requestId` is the idempotency key: reuse it when retrying one attempt.
 *  Without a `creditId`, Codex picks the credit. */
export async function consumeCodexResetCredit(
  account: Account,
  input: { creditId?: string; requestId: string },
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
        body: JSON.stringify({
          redeem_request_id: input.requestId,
          ...(input.creditId ? { credit_id: input.creditId } : {}),
        }),
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
