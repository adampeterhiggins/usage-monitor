/** Authentication configuration for an account.
 *
 *  Two separate concerns are modeled: which provider the account belongs to
 *  (`Account.provider` in contracts/accounts) and the selected authentication
 *  source. Variants follow the combinations the product actually supports —
 *  `cursor-ide` only makes sense for Cursor, and `accountId` is the secondary
 *  ChatGPT account identifier Codex attaches to its credential shapes.
 *
 *  `session` vs `pasted` is provenance (managed sign-in vs user-pasted), not
 *  format — the fetchers only read the material, so the distinction exists for
 *  the edit form. */

import type { ProviderId } from "./providers";

/** The `extra` selector value that pins a Cursor account to the desktop app. */
export const CURSOR_IDE_SELECTOR = "ide";

export type AccountAuth =
  /** Discover the local login automatically (Keychain → CLI file → app). */
  | { kind: "local-auto" }
  /** A specific macOS Keychain entry under the provider's service. */
  | { kind: "local-keychain"; keychainAccount: string }
  /** The Cursor desktop app's `state.vscdb` login. Cursor only. */
  | { kind: "cursor-ide" }
  /** Credential produced by the app's own sign-in flow. */
  | { kind: "session"; credential: string; accountId?: string }
  /** Credential the user pasted in (auth.json, session cookie, raw token). */
  | { kind: "pasted"; credential: string; accountId?: string };

export type AccountAuthKind = AccountAuth["kind"];

/** Which combinations a provider may carry — guards nonsensical unions. */
export function authAllowedForProvider(provider: ProviderId, auth: AccountAuth): boolean {
  if (auth.kind === "cursor-ide") return provider === "cursor";
  return true;
}

/** The secret material the provider request needs — "" for local auth. */
export function authCredential(auth: AccountAuth): string {
  return auth.kind === "session" || auth.kind === "pasted" ? auth.credential : "";
}

/** The local-login selector: a Keychain account name, or the Cursor IDE pin. */
export function authLocalSelector(auth: AccountAuth): string | undefined {
  if (auth.kind === "local-keychain") return auth.keychainAccount;
  if (auth.kind === "cursor-ide") return CURSOR_IDE_SELECTOR;
  return undefined;
}

/** The secondary provider account identifier (Codex's ChatGPT account id). */
export function authAccountId(auth: AccountAuth): string | undefined {
  return auth.kind === "session" || auth.kind === "pasted" ? auth.accountId : undefined;
}

/** Normalized result of a provider sign-in flow. `accountId` carries Codex's
 *  ChatGPT account id; other providers leave it undefined. */
export interface ProviderLoginResult {
  credential: string;
  accountId?: string;
  suggestedLabel?: string;
}
