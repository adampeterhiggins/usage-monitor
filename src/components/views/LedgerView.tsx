import { PROVIDERS } from "../../providers/metadata";
import type { AccountPublic } from "../../contracts/accounts";
import type { UsageWindow } from "../../contracts/usage";
import { formatFetchedAt, formatPercent, formatReset } from "../../lib/usage/format";
import { severityFillClass, severityTextClass } from "../../lib/usage/presentation";
import { AccountActionsMenu } from "../accounts/AccountActionsMenu";
import type { AccountFetchState } from "../../state/usage";
import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Text } from "../ui/text";

interface LedgerViewProps {
  accounts: AccountPublic[];
  fetchStates: Record<string, AccountFetchState>;
  onEdit: (account: AccountPublic) => void;
  onRefresh: (account: AccountPublic) => void;
}

export function LedgerView({ accounts, fetchStates, onEdit, onRefresh }: LedgerViewProps) {
  return (
    <div className="flex flex-col gap-5 p-4 pb-8">
      {accounts.map((account) => {
        const state = fetchStates[account.id] ?? { status: "loading" as const };
        const result = state.status === "ok" ? state.result : state.previous;
        const snapshot = result?.snapshot;
        const meta = PROVIDERS[account.provider];
        const stale = result?.stale === true;
        const isErrorOnly = state.status === "error" && !snapshot;

        return (
          <section key={account.id} className="flex min-w-0 flex-col gap-1">
            <div className="flex min-w-0 items-center justify-between gap-3 border-b border-ui-subtle pb-1.5">
              <div className="flex min-w-0 items-baseline gap-2">
                <Badge color={meta.tone} size="small" className="shrink-0">
                  {meta.name}
                </Badge>
                <Text variant="usage-account" className="truncate">
                  {account.label}
                </Text>
                {snapshot?.planLabel ? (
                  <Text variant="small" color="tertiary" className="shrink-0 truncate">
                    {snapshot.planLabel}
                  </Text>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Text variant="mini" color={stale ? "orange" : "quaternary"} className="tabular-nums">
                  {state.status === "loading" && !snapshot
                    ? "Loading…"
                    : snapshot
                      ? `${stale ? "stale · " : ""}${formatFetchedAt(snapshot.fetchedAt)}`
                      : ""}
                </Text>
                <AccountActionsMenu account={account} onEdit={onEdit} onRefresh={onRefresh} />
              </div>
            </div>

            {isErrorOnly ? (
              <div className="flex min-w-0 items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <Text variant="small-strong" color="red">
                    Couldn’t fetch usage
                  </Text>
                  <Text variant="small" color="secondary" className="truncate">
                    {state.message}
                  </Text>
                </div>
                <Button size="small" variant="filled" onClick={() => onRefresh(account)}>
                  Try again
                </Button>
              </div>
            ) : snapshot ? (
              snapshot.windows.map((w) => <LedgerWindowRow key={w.label} window={w} />)
            ) : (
              <div className="flex flex-col gap-2 py-1.5">
                {[0, 1].map((i) => (
                  <div key={i} className="h-4 w-full animate-pulse rounded-full bg-ui-control" />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function LedgerWindowRow({ window }: { window: UsageWindow }) {
  const pct = window.usedPercent === undefined ? undefined : Math.min(100, Math.max(0, window.usedPercent));
  const caption = [formatReset(window.resetsAt), window.detail].filter(Boolean).join(" · ");

  return (
    <div className="flex min-w-0 items-center gap-3 py-2">
      <Text variant="usage-label" color="secondary" className="w-36 shrink-0 truncate">
        {window.label}
      </Text>
      <Text variant="usage-caption" color="quaternary" className="hidden max-w-56 shrink-0 truncate text-right @lg:block">
        {caption}
      </Text>
      <div className="min-w-8 flex-1 overflow-hidden bg-ui-control [border-radius:var(--form-meter-radius)] [height:var(--form-meter-height)]">
        <div
          className={cn(
            "relative h-full rounded-[inherit] transition-[width] duration-300 ease-out",
            "after:absolute after:inset-0 after:[background-image:var(--form-meter-notch)]",
            severityFillClass(pct),
          )}
          style={{ width: pct === undefined ? "0%" : `${pct}%` }}
        />
      </div>
      <Text
        variant="usage-value"
        className={cn("w-12 shrink-0 text-right", pct !== undefined && severityTextClass(pct))}
      >
        {formatPercent(pct)}
      </Text>
    </div>
  );
}
