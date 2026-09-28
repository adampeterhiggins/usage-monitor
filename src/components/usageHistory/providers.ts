/** Display copy for usage-history providers. Colors reuse the account
 *  cards' provider tones so a provider reads the same across the app. */

import type { UsageHistoryProvider } from "../../contracts/usageHistory";
import { PROVIDERS } from "../../providers/metadata";

const LABELS: Record<UsageHistoryProvider, string> = {
  claude: "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  devin: "Devin",
};

export function usageHistoryProvider(provider: UsageHistoryProvider): {
  label: string;
  color: string;
} {
  return {
    label: LABELS[provider],
    color: `var(--color-ui-provider-${PROVIDERS[provider].tone}-fg)`,
  };
}
