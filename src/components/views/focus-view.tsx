import * as React from "react";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import {
  formatFetchedAt,
  PROVIDERS,
  severityColor,
  worstPercent,
  type AccountPublic,
  type ProviderId,
} from "../../lib/usage/types";
import { AccountActionsMenu } from "../accounts/account-actions-menu";
import type { AccountFetchState } from "../../lib/usage/service";
import { UsageProgress } from "../ui/usage-progress";
import { Badge, Button, cn, Text } from "../ui";

interface FocusViewProps {
  grouped: Array<{ id: ProviderId; accounts: AccountPublic[] }>;
  fetchStates: Record<string, AccountFetchState>;
  selectedId: string | null;
  onSelectedIdChange: (id: string | null) => void;
  onEdit: (account: AccountPublic) => void;
  onRefresh: (account: AccountPublic) => void;
}

export function FocusView({
  grouped,
  fetchStates,
  selectedId,
  onSelectedIdChange,
  onEdit,
  onRefresh,
}: FocusViewProps) {
  const flat = grouped.flatMap((g) => g.accounts);
  const selected = flat.find((a) => a.id === selectedId) ?? null;

  React.useEffect(() => {
    if (!selected && flat.length > 0) onSelectedIdChange(flat[0].id);
  }, [selected, flat, onSelectedIdChange]);

  const state = selected ? (fetchStates[selected.id] ?? { status: "loading" as const }) : undefined;
  const result = state?.status === "ok" ? state.result : state?.previous;
  const snapshot = result?.snapshot;
  const meta = selected ? PROVIDERS[selected.provider] : undefined;
  const stale = result?.stale === true;

  return (
    <div className="flex h-full min-h-0">
      <div className="w-52 shrink-0 overflow-y-auto border-r border-separator p-2">
        {grouped.map((group) => (
          <div key={group.id} className="mb-3">
            <Text variant="mini" color="quaternary" className="px-2 py-1">
              {PROVIDERS[group.id].name}
            </Text>
            {group.accounts.map((account) => {
              const s = fetchStates[account.id] ?? { status: "loading" as const };
              const r = s.status === "ok" ? s.result : s.previous;
              const worst = r ? worstPercent(r.snapshot.windows) : undefined;
              const isErrorOnly = s.status === "error" && !r;
              const active = selected?.id === account.id;
              return (
                <button
                  key={account.id}
                  onClick={() => onSelectedIdChange(account.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left",
                    active ? "bg-control" : "hover:bg-control-subtle",
                  )}
                >
                  <span className="truncate text-[13px] font-medium">{account.label}</span>
                  {isErrorOnly ? (
                    <Badge size="small" color="red">
                      error
                    </Badge>
                  ) : worst !== undefined ? (
                    <Badge size="small" color={severityColor(worst)}>
                      {Math.round(worst)}%
                    </Badge>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto">
        {!selected ? (
          <div className="flex h-full items-center justify-center">
            <Text color="tertiary">Select an account</Text>
          </div>
        ) : (
          <div className="flex max-w-xl flex-col gap-4 p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex min-w-0 items-center gap-2">
                  <Badge color={meta!.accent}>{meta!.name}</Badge>
                  <Text variant="large-strong" className="truncate">
                    {selected.label}
                  </Text>
                  {state?.status === "loading" ? (
                    <LoaderCircle className="size-4 shrink-0 animate-spin text-tertiary" />
                  ) : null}
                  {stale ? (
                    <TriangleAlert className="size-4 shrink-0 text-support-orange" aria-label="Stale data" />
                  ) : null}
                </div>
                {snapshot?.planLabel ? <Text color="tertiary">{snapshot.planLabel}</Text> : null}
              </div>
              <AccountActionsMenu account={selected} onEdit={onEdit} onRefresh={onRefresh} />
            </div>

            {snapshot ? (
              <div className="flex flex-col gap-4 border-t border-separator pt-3">
                {snapshot.windows.map((w) => (
                  <UsageProgress
                    key={w.label}
                    label={w.label}
                    usedPercent={w.usedPercent}
                    resetsAt={w.resetsAt}
                    detail={w.detail}
                  />
                ))}
                <Text variant="mini" color="quaternary" className="pt-1 tabular-nums">
                  {result?.cached ? "cached · " : ""}
                  updated {formatFetchedAt(snapshot.fetchedAt)}
                  {stale ? " · stale" : ""}
                </Text>
              </div>
            ) : state?.status === "error" ? (
              <div className="flex flex-col gap-2 border-t border-separator pt-3">
                <Text variant="small-strong" color="red">
                  Couldn’t load usage
                </Text>
                <Text variant="small" color="secondary">
                  {state.message}
                </Text>
                <div>
                  <Button size="small" variant="filled" onClick={() => onRefresh(selected)}>
                    Try again
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 border-t border-separator pt-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-8 animate-pulse rounded-xl bg-control-subtle" />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
