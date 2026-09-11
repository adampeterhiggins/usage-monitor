import { LoaderCircle, TriangleAlert } from "lucide-react";
import { PROVIDERS } from "../../lib/auth/provider-meta";
import type { AccountPublic } from "../../lib/contracts/accounts";
import { formatFetchedAt } from "../../lib/usage/format";
import type { AccountFetchState } from "../../lib/usage/service";
import { AccountActionsMenu } from "./account-actions-menu";
import { UsageProgress } from "../ui/usage-progress";
import { Badge, Button, cn, Text } from "../ui";

interface AccountCardProps {
  account: AccountPublic;
  state: AccountFetchState;
  onEdit: (account: AccountPublic) => void;
  onRefresh: (account: AccountPublic) => void;
}

export function AccountCard({ account, state, onEdit, onRefresh }: AccountCardProps) {
  const meta = PROVIDERS[account.provider];
  const result = state.status === "ok" ? state.result : state.previous;
  const snapshot = result?.snapshot;
  const isLoading = state.status === "loading";
  const isError = state.status === "error";
  const stale = result?.stale === true;

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-[18px] border border-separator bg-surface p-3.5",
        isError && !snapshot && "border-support-red/40",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Badge color={meta.accent} className="shrink-0">
          {meta.name}
        </Badge>
        <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <Text variant="strong" className="max-w-full shrink-0 truncate">
            {account.label}
          </Text>
          {snapshot?.planLabel ? (
            <Text variant="small" color="tertiary" className="min-w-0 truncate">
              · {snapshot.planLabel}
            </Text>
          ) : null}
        </div>
        {isLoading ? <LoaderCircle className="size-3.5 shrink-0 animate-spin text-tertiary" /> : null}
        {stale && !isLoading ? (
          <TriangleAlert className="size-3.5 shrink-0 text-support-orange" aria-label="Stale data" />
        ) : null}
        <AccountActionsMenu account={account} onEdit={onEdit} onRefresh={onRefresh} />
      </div>

      {snapshot ? (
        <div className="flex flex-col gap-2.5">
          {snapshot.windows.map((window) => (
            <UsageProgress
              key={window.label}
              label={window.label}
              usedPercent={window.usedPercent}
              resetsAt={window.resetsAt}
              detail={window.detail}
            />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col gap-1.5 py-1">
          <Text variant="small-strong" color="red">
            Couldn’t load usage
          </Text>
          <Text variant="small" color="secondary" className="line-clamp-3">
            {state.message}
          </Text>
          <div>
            <Button size="small" variant="filled" onClick={() => onRefresh(account)}>
              Try again
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-1">
              <div className="h-3 w-24 animate-pulse rounded-full bg-control-subtle" />
              <div className="h-1.5 w-full animate-pulse rounded-full bg-control-subtle" />
            </div>
          ))}
        </div>
      )}

      {snapshot ? (
        <Text variant="mini" color="quaternary" className="pt-0.5 tabular-nums">
          {result?.cached ? "cached · " : ""}
          updated {formatFetchedAt(snapshot.fetchedAt)}
          {stale ? " · stale" : ""}
        </Text>
      ) : null}
    </div>
  );
}
