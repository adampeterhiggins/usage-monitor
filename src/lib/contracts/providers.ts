/** Shared provider identifier — the one contract every layer agrees on.
 *  Display copy lives in `lib/auth/provider-meta.ts`; per-provider protocol
 *  parsing stays in `lib/usage/` and `lib/auth/`. */

export type ProviderId = "claude" | "codex" | "cursor";
