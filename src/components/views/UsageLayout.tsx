/** Layout dispatch — the single presentation contract every usage view
 *  renders through: ordered accounts, per-account fetch state, and the
 *  edit/refresh actions. Grouped and Stacked share one renderer with a
 *  column-count difference. */

import type { AccountPublic } from "../../contracts/accounts";
import type { AccountFetchState } from "../../contracts/usage";
import type { Layout } from "../../lib/settings/layout";
import { PROVIDERS } from "../../providers/metadata";
import { AccountCard } from "../accounts/AccountCard";
import { Text } from "../ui/text";
import { FocusView } from "./FocusView";
import { LedgerView } from "./LedgerView";
import { StripView } from "./StripView";
import type { ProviderGroup } from "./accountGrouping";

export interface UsageLayoutProps {
  layout: Layout;
  /** Visible accounts in persisted order — Wall and Ledger read this. */
  accounts: AccountPublic[];
  /** Provider-grouped accounts — Grouped, Stacked, Strip, and Focus read this. */
  grouped: ProviderGroup[];
  fetchStates: Record<string, AccountFetchState>;
  focusSelectedId: string | null;
  onFocusSelectedIdChange: (id: string | null) => void;
  onEdit: (account: AccountPublic) => void;
  onRefresh: (account: AccountPublic) => void;
}

export function UsageLayout({
  layout,
  accounts,
  grouped,
  fetchStates,
  focusSelectedId,
  onFocusSelectedIdChange,
  onEdit,
  onRefresh,
}: UsageLayoutProps) {
  switch (layout) {
    case "ledger":
      return (
        <LedgerView
          accounts={accounts}
          fetchStates={fetchStates}
          onEdit={onEdit}
          onRefresh={onRefresh}
        />
      );
    case "strip":
      return (
        <StripView
          grouped={grouped}
          fetchStates={fetchStates}
          onEdit={onEdit}
          onRefresh={onRefresh}
        />
      );
    case "focus":
      return (
        <FocusView
          grouped={grouped}
          fetchStates={fetchStates}
          selectedId={focusSelectedId}
          onSelectedIdChange={onFocusSelectedIdChange}
          onEdit={onEdit}
          onRefresh={onRefresh}
        />
      );
    case "grouped":
    case "stacked":
      return (
        <div className="flex flex-col gap-5 p-4 pb-8">
          {grouped.map((group) => (
            <section key={group.id} className="flex flex-col gap-2.5">
              <div className="flex items-baseline justify-between px-0.5">
                <Text variant="small-strong" color="secondary">
                  {PROVIDERS[group.id].name}
                </Text>
                <Text variant="mini" color="quaternary">
                  {group.accounts.length}
                </Text>
              </div>
              <div
                className={
                  layout === "stacked" ? "grid grid-cols-1 gap-3" : "grid grid-cols-2 gap-3"
                }
              >
                {group.accounts.map((account) => (
                  <AccountCard
                    key={account.id}
                    account={account}
                    state={fetchStates[account.id] ?? { status: "loading" }}
                    onEdit={onEdit}
                    onRefresh={onRefresh}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      );
    case "wall":
    default:
      return (
        <div className="grid grid-cols-2 gap-3 p-4">
          {accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              state={fetchStates[account.id] ?? { status: "loading" }}
              onEdit={onEdit}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      );
  }
}
