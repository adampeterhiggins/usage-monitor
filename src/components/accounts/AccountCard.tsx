import { LoaderCircle, TriangleAlert } from "lucide-react";
import { PROVIDERS } from "../../providers/metadata";
import type { AccountPublic } from "../../contracts/accounts";
import { formatFetchedAt } from "../../lib/usage/format";
import type { AccountFetchState } from "../../state/usage";
import { AccountActionsMenu } from "./AccountActionsMenu";
import { UsageProgress } from "../ui/UsageProgress";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Text } from "../ui/text";

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

  // Every dimension below belongs to the active visual identity. The card fill
  // prefers its provider's tint when the identity defines one —
  // `--form-card-tint-*` is `initial` otherwise, so the var() falls back to
  // the plain card surface.
  return (
    <div
      data-ui-surface="card"
      style={{
        background: `var(--form-card-tint-${meta.tone}, var(--form-card-background))`,
        borderRadius: "var(--form-card-radius)",
        borderWidth: "var(--form-card-border-width)",
        borderColor:
          isError && !snapshot
            ? "var(--local-status-critical-fill)"
            : "var(--form-card-border-color)",
        boxShadow: "var(--form-card-shadow)",
        padding: "var(--form-card-padding)",
        gap: "var(--form-card-inner-gap)",
      }}
      className="ui-surface flex min-w-0 flex-col border-solid"
    >
      <div className="flex min-w-0 items-center gap-2">
        <Badge color={meta.tone} className="shrink-0">
          {meta.name}
        </Badge>
        <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <Text variant="usage-account" className="max-w-full shrink-0 truncate">
            {account.label}
          </Text>
          {snapshot?.planLabel ? (
            <Text variant="usage-caption" color="tertiary" className="min-w-0 truncate">
              · {snapshot.planLabel}
            </Text>
          ) : null}
        </div>
        {isLoading ? <LoaderCircle className="size-3.5 shrink-0 animate-spin text-ui-tertiary" /> : null}
        {stale && !isLoading ? (
          <TriangleAlert className="size-3.5 shrink-0 text-ui-status-high-text" aria-label="Stale data" />
        ) : null}
        <AccountActionsMenu account={account} onEdit={onEdit} onRefresh={onRefresh} />
      </div>

      {snapshot ? (
        <div className="flex flex-col" style={{ gap: "var(--form-window-gap)" }}>
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
        <div className="flex flex-col" style={{ gap: "var(--form-window-gap)" }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-1">
              <div className="h-3 w-24 animate-pulse rounded-full bg-ui-control" />
              <div className="h-1.5 w-full animate-pulse rounded-full bg-ui-control" />
            </div>
          ))}
        </div>
      )}

      {snapshot ? (
        <Text variant="usage-caption" color="quaternary" className="pt-0.5 tabular-nums">
          {result?.cached ? "cached · " : ""}
          updated {formatFetchedAt(snapshot.fetchedAt)}
          {stale ? " · stale" : ""}
        </Text>
      ) : null}
    </div>
  );
}
