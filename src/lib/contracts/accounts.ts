/** Internal account model and its public projection.
 *
 *  `Account` is secret-bearing (via `auth`) and stays inside the accounts +
 *  usage layers. `AccountPublic` is what UI renders: it exposes which login
 *  method is selected and whether credentials exist — never the material
 *  itself. */

import type { AccountAuth } from "./auth";
import { authCredential } from "./auth";
import type { ProviderId } from "./providers";

export interface Account {
  id: string;
  provider: ProviderId;
  label: string;
  auth: AccountAuth;
  hidden: boolean;
}

export interface AccountPublic {
  id: string;
  provider: ProviderId;
  label: string;
  /** The selected login method — safe to render. */
  authKind: AccountAuth["kind"];
  hasCredential: boolean;
  hidden: boolean;
}

export function toPublic(account: Account): AccountPublic {
  return {
    id: account.id,
    provider: account.provider,
    label: account.label,
    authKind: account.auth.kind,
    hasCredential: authCredential(account.auth).trim().length > 0,
    hidden: account.hidden,
  };
}
