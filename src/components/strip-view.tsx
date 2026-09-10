import { Clock } from "lucide-react";
import {
  formatPercent,
  PROVIDERS,
  severityColor,
  shortLabel,
  type AccountPublic,
  type ProviderId,
} from "../lib/usage/types";
import { AccountActionsMenu } from "./account-actions-menu";
import type { AccountFetchState } from "./account-card";
import { Badge, Text } from "./ui";

interface StripViewProps {
  grouped: Array<{ id: ProviderId; accounts: AccountPublic[] }>;
  fetchStates: Record<string, AccountFetchState>;
  onEdit: (account: AccountPublic) => void;
  onRemoved: (accountId: string) => void;
  onRefresh: (account: AccountPublic) => void;
}

export function StripView({ grouped, fetchStates, onEdit, onRemoved, onRefresh }: StripViewProps) {
  return (
    <div className="flex flex-col gap-4 p-3 pb-8">
      {grouped.map((group) => (
        <section key={group.id} className="flex flex-col gap-1">
          <Text variant="mini" color="quaternary" className="px-2">
            {PROVIDERS[group.id].name}
          </Text>
          {group.accounts.map((account) => {
            const state = fetchStates[account.id] ?? { status: "loading" as const };
            const result = state.status === "ok" ? state.result : state.previous;
            const snapshot = result?.snapshot;
            const stale = result?.stale === true;
            const isErrorOnly = state.status === "error" && !snapshot;
            const windows = (snapshot?.windows ?? []).filter((w) => w.usedPercent !== undefined);

            return (
              <div
                key={account.id}
                className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 hover:bg-control-subtle"
              >
                <div className="min-w-0">
                  <Text variant="strong" className="truncate">
                    {account.label}
                  </Text>
                  <div className="truncate text-[11px] text-tertiary">
                    {isErrorOnly ? state.message : (snapshot?.planLabel ?? "Loading…")}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {stale ? <Clock className="size-3.5 text-support-orange" aria-label="Stale data" /> : null}
                  {isErrorOnly ? (
                    <Badge size="small" color="red">
                      error
                    </Badge>
                  ) : (
                    windows.map((w) => (
                      <Badge key={w.label} size="small" color={severityColor(w.usedPercent)}>
                        {shortLabel(w.label)} {formatPercent(w.usedPercent)}
                      </Badge>
                    ))
                  )}
                  <AccountActionsMenu account={account} onEdit={onEdit} onRemoved={onRemoved} onRefresh={onRefresh} />
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
