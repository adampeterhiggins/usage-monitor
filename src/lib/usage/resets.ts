/** Reading and redeeming banked usage resets. Redeeming is an account-level
 *  action, so each account keeps one pending idempotency key and one queue:
 *  overlapping confirms wait their turn instead of spending two credits, and
 *  a retry after an unanswered attempt re-sends the same attempt. */

import type { Account } from "../../contracts/accounts";
import { ResetCreditError, type ResetCredits, type ResetOutcome } from "../../contracts/resets";
import type { UsageFetchHooks } from "../../contracts/usage";
import { consumeProviderResetCredit, fetchProviderResetCredits } from "../../providers/registry";
import { replaceAccountCredential } from "../accounts/operations";
import { getAccount } from "../accounts/repository";
import { invalidate } from "./policy";

const pendingKeys = new Map<string, string>();
const queues = new Map<string, Promise<unknown>>();

async function loadAccount(accountId: string): Promise<{ account: Account; hooks: UsageFetchHooks }> {
  const account = await getAccount(accountId);
  if (!account) throw new Error("Account not found.");
  return {
    account,
    hooks: { persistCredential: (credential) => replaceAccountCredential(accountId, credential) },
  };
}

export async function readResetCredits(accountId: string): Promise<ResetCredits> {
  const { account, hooks } = await loadAccount(accountId);
  return fetchProviderResetCredits(account, hooks);
}

export function redeemResetCredit(accountId: string, credits: ResetCredits): Promise<ResetOutcome> {
  const previous = queues.get(accountId) ?? Promise.resolve();
  const run = previous
    .catch(() => undefined)
    .then(async () => {
      const { account, hooks } = await loadAccount(accountId);
      const requestId = pendingKeys.get(accountId) ?? crypto.randomUUID();
      pendingKeys.set(accountId, requestId);
      try {
        const outcome = await consumeProviderResetCredit(
          account,
          { creditId: credits.nextCreditId, requestId },
          hooks,
        );
        pendingKeys.delete(accountId);
        if (outcome === "reset") invalidate(accountId);
        return outcome;
      } catch (e) {
        if (e instanceof ResetCreditError && e.settled) pendingKeys.delete(accountId);
        throw e;
      }
    });
  queues.set(accountId, run);
  run
    .finally(() => {
      if (queues.get(accountId) === run) queues.delete(accountId);
    })
    .catch(() => undefined);
  return run;
}
