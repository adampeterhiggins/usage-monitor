/** Provider dispatch — the one switch from ProviderId to usage fetcher.
 *  Each provider module owns its own auth + usage translation; shared
 *  login-session mechanics live in shared/. */

import type { Account } from "../contracts/accounts";
import type { ProviderId } from "../contracts/providers";
import type { ResetCredits, ResetOutcome } from "../contracts/resets";
import type { UsageFetchHooks, UsageSnapshot } from "../contracts/usage";
import { consumeClaudeResetCredit, fetchClaudeResetCredits } from "./claude/resets";
import { fetchClaudeUsage } from "./claude/usage";
import { consumeCodexResetCredit, fetchCodexResetCredits } from "./codex/resets";
import { fetchCodexUsage } from "./codex/usage";
import { fetchCursorUsage } from "./cursor/usage";
import { fetchDevinUsage } from "./devin/usage";
import { fetchGrokUsage } from "./grok/usage";
import { fetchOpenCodeUsage } from "./opencode/usage";

export function fetchProviderUsage(
  account: Account,
  hooks: UsageFetchHooks,
): Promise<UsageSnapshot> {
  switch (account.provider) {
    case "claude":
      return fetchClaudeUsage(account, hooks);
    case "codex":
      return fetchCodexUsage(account, hooks);
    case "cursor":
      return fetchCursorUsage(account);
    case "devin":
      return fetchDevinUsage(account);
    case "grok":
      return fetchGrokUsage(account);
    case "opencode":
      return fetchOpenCodeUsage(account);
  }
}

export function supportsResetCredits(provider: ProviderId): boolean {
  return provider === "claude" || provider === "codex";
}

export function fetchProviderResetCredits(
  account: Account,
  hooks: UsageFetchHooks,
): Promise<ResetCredits> {
  switch (account.provider) {
    case "claude":
      return fetchClaudeResetCredits(account, hooks);
    case "codex":
      return fetchCodexResetCredits(account, hooks);
    default:
      return Promise.reject(new Error("This provider has no usage resets."));
  }
}

export function consumeProviderResetCredit(
  account: Account,
  input: { creditId?: string; requestId: string },
  hooks: UsageFetchHooks,
): Promise<ResetOutcome> {
  switch (account.provider) {
    case "claude":
      return consumeClaudeResetCredit(account, { grantId: input.creditId, requestId: input.requestId }, hooks);
    case "codex":
      return consumeCodexResetCredit(account, input, hooks);
    default:
      return Promise.reject(new Error("This provider has no usage resets."));
  }
}
