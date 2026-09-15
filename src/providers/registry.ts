/** Provider dispatch — the one switch from ProviderId to usage fetcher.
 *  Each provider module owns its own auth + usage translation; shared
 *  login-session mechanics live in shared/. */

import type { Account } from "../contracts/accounts";
import type { UsageFetchHooks, UsageSnapshot } from "../contracts/usage";
import { fetchClaudeUsage } from "./claude/usage";
import { fetchCodexUsage } from "./codex/usage";
import { fetchCursorUsage } from "./cursor/usage";
import { fetchDevinUsage } from "./devin/usage";

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
  }
}
