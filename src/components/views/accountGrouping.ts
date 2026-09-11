/** Pure account grouping/ordering helpers for the usage layouts. */

import type { AccountPublic } from "../../contracts/accounts";
import type { ProviderId } from "../../contracts/providers";
import { PROVIDER_ORDER } from "../../providers/metadata";

export interface ProviderGroup {
  id: ProviderId;
  accounts: AccountPublic[];
}

/** Group visible accounts by provider in registry order; empty groups drop. */
export function groupByProvider(accounts: AccountPublic[]): ProviderGroup[] {
  const map = new Map<ProviderId, AccountPublic[]>();
  for (const id of PROVIDER_ORDER) map.set(id, []);
  for (const account of accounts) {
    map.get(account.provider)?.push(account);
  }
  return PROVIDER_ORDER.map((id) => ({ id, accounts: map.get(id) ?? [] })).filter(
    (g) => g.accounts.length > 0,
  );
}
