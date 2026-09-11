/** Compatibility codec between the stored `accounts.json` row shape
 *  (`{credential, extra?}`) and the internal `AccountAuth` union.
 *
 *  Decode rules preserve existing semantics exactly:
 *  - blank credential → local login; `extra` is the Keychain pin, or the
 *    Cursor IDE selector when it equals `"ide"` on a Cursor account
 *  - nonempty credential → session material when it matches the provider's
 *    managed-login shape, else a pasted credential; `extra` is the secondary
 *    provider account id (Codex's ChatGPT account id)
 *
 *  `session` vs `pasted` cannot be recovered from the stored row for
 *  arbitrary pasted text — the decoder uses the same shape inference the
 *  edit form already used, so reopening a stored account keeps its current
 *  displayed sign-in method. Unknown credential text is preserved verbatim.
 */

import type { Account } from "../../contracts/accounts";
import {
  CURSOR_IDE_SELECTOR,
  type AccountAuth,
} from "../../contracts/auth";
import type { ProviderId } from "../../contracts/providers";
import { credentialLooksLikeSession } from "../../providers/shared/providerLogin";

export interface StoredAccountRow {
  id: string;
  provider: ProviderId;
  label: string;
  credential: string;
  extra?: string;
  hidden: boolean;
}

export function authFromLegacy(
  provider: ProviderId,
  credential: string,
  extra: string | undefined,
): AccountAuth {
  const sel = extra?.trim() || undefined;
  if (credential.trim() === "") {
    if (provider === "cursor" && sel === CURSOR_IDE_SELECTOR) return { kind: "cursor-ide" };
    if (sel) return { kind: "local-keychain", keychainAccount: sel };
    return { kind: "local-auto" };
  }
  const accountId = sel;
  return credentialLooksLikeSession(provider, credential)
    ? { kind: "session", credential, accountId }
    : { kind: "pasted", credential, accountId };
}

export function legacyFieldsFromAuth(
  auth: AccountAuth,
): Pick<StoredAccountRow, "credential" | "extra"> {
  switch (auth.kind) {
    case "local-auto":
      return { credential: "" };
    case "local-keychain":
      return { credential: "", extra: auth.keychainAccount };
    case "cursor-ide":
      return { credential: "", extra: CURSOR_IDE_SELECTOR };
    case "session":
    case "pasted":
      return { credential: auth.credential, extra: auth.accountId };
  }
}

const PROVIDERS = new Set<ProviderId>(["claude", "codex", "cursor"]);

export function decodeStoredAccount(raw: unknown): Account | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  if (typeof a.id !== "string" || typeof a.label !== "string") return null;
  if (typeof a.provider !== "string" || !PROVIDERS.has(a.provider as ProviderId)) return null;
  const credential = typeof a.credential === "string" ? a.credential : "";
  const extra = typeof a.extra === "string" && a.extra ? a.extra : undefined;
  return {
    id: a.id,
    provider: a.provider as ProviderId,
    label: a.label,
    auth: authFromLegacy(a.provider as ProviderId, credential, extra),
    hidden: a.hidden === true,
  };
}

export function encodeAccount(account: Account): StoredAccountRow {
  return {
    id: account.id,
    provider: account.provider,
    label: account.label,
    ...legacyFieldsFromAuth(account.auth),
    hidden: account.hidden,
  };
}
