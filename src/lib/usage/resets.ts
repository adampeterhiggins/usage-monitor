/** Reading and redeeming banked usage resets. Redeeming is an account-level
 *  action, so each account keeps one queue: overlapping confirms wait their
 *  turn instead of racing. Each credit keeps one pending idempotency key, so
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

/** Without a `creditId`, the provider spends whichever credit it picks. */
export function redeemResetCredit(accountId: string, creditId?: string): Promise<ResetOutcome> {
  const key = `${accountId}\u0000${creditId ?? ""}`;
  const previous = queues.get(accountId) ?? Promise.resolve();
  const run = previous
    .catch(() => undefined)
    .then(async () => {
      const { account, hooks } = await loadAccount(accountId);
      const requestId = pendingKeys.get(key) ?? crypto.randomUUID();
      pendingKeys.set(key, requestId);
      try {
        const outcome = await consumeProviderResetCredit(account, { creditId, requestId }, hooks);
        pendingKeys.delete(key);
        if (outcome === "reset") invalidate(accountId);
        return outcome;
      } catch (e) {
        if (e instanceof ResetCreditError && e.settled) pendingKeys.delete(key);
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
