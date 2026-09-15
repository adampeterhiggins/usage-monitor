/** Shared provider identifier — the one contract every layer agrees on.
 *  Display copy lives in `lib/auth/provider-meta.ts`; per-provider protocol
 *  parsing stays in `lib/usage/` and `lib/auth/`. */

/** The canonical provider list. `ProviderId` is derived from it so a runtime
 *  check and the type can never drift apart — a hand-written allowlist that
 *  missed a provider silently dropped stored accounts for it. */
export const PROVIDER_IDS = ["claude", "codex", "cursor", "devin"] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];
