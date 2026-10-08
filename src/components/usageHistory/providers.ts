/** Display copy for usage-history providers. Colors use the account cards'
 *  provider tones so a provider reads the same across the app; history
 *  sources without an account card get tones of their own. */

import type { UsageHistoryProvider } from "../../contracts/usageHistory";
import type { UiProviderTone } from "../../lib/theme/ui-tokens";

const LABELS: Record<UsageHistoryProvider, string> = {
  claude: "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  devin: "Devin",
  grok: "Grok",
  opencode: "OpenCode",
  antigravity: "Antigravity",
};

const TONES: Record<UsageHistoryProvider, UiProviderTone> = {
  claude: "orange",
  codex: "green",
  cursor: "blue",
  devin: "purple",
  grok: "slate",
  opencode: "teal",
  antigravity: "pink",
};

export function usageHistoryProvider(provider: UsageHistoryProvider): {
  label: string;
  color: string;
} {
  return {
    label: LABELS[provider],
    color: `var(--color-ui-provider-${TONES[provider]}-fg)`,
  };
}
