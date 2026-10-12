import * as Popover from "@radix-ui/react-popover";
import { CircleAlert, X } from "lucide-react";
import type { AccountPublic } from "../../contracts/accounts";
import type { AccountFetchState } from "../../contracts/usage";
import { formatFetchedAt } from "../../lib/usage/format";
import { fetchFailureCopy } from "../../lib/usage/presentation";
import { PROVIDERS } from "../../providers/metadata";
import { Button } from "../ui/button";
import { toast } from "../ui/toast";

interface RefreshFailuresPopoverProps {
  accounts: AccountPublic[];
  states: Record<string, AccountFetchState>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh: (account: AccountPublic) => void;
  onEdit: (account: AccountPublic) => void;
}

export function RefreshFailuresPopover({
  accounts, states, open, onOpenChange, onRefresh, onEdit,
}: RefreshFailuresPopoverProps) {
  const failures = accounts.flatMap((account) => {
    const state = states[account.id];
    return state?.status === "error" ? [{ account, state }] : [];
  });

  if (failures.length === 0) return null;

  async function copyError(account: AccountPublic, message: string) {
    try {
      await navigator.clipboard.writeText(`${PROVIDERS[account.provider].name} · ${account.label}\n${message}`);
      toast.success("Error copied");
    } catch {
      toast.error("Couldn’t copy error", { description: "Select the error text to copy it manually." });
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <Button
          variant="glass"
          size="medium"
          data-tone="warning"
          className="shrink-0 rounded-l-none border-l border-ui-subtle text-ui-status-warning-text"
          aria-label={`View refresh errors: ${failures.length} failed`}
        >
          <CircleAlert className="size-3.5 shrink-0" />
          {failures.length} failed
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          data-ui-surface="menu"
          aria-label="Refresh errors"
          align="start"
          side="bottom"
          sideOffset={6}
          collisionPadding={8}
          className="ui-surface no-drag z-[80] w-[360px] max-w-[calc(100vw-16px)] overflow-y-auto rounded-[12px] p-4 shadow-menu ring-1 ring-ui-subtle"
          style={{ maxHeight: "var(--radix-popover-content-available-height)" }}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-[13px] font-semibold">
              {failures.length} {failures.length === 1 ? "account couldn’t" : "accounts couldn’t"} refresh
            </h2>
            <Popover.Close asChild>
              <Button variant="transparent" size="small" iconOnly aria-label="Close refresh errors">
                <X className="size-3.5" />
              </Button>
            </Popover.Close>
          </div>
          <div className="flex flex-col gap-4">
            {failures.map(({ account, state }) => {
              const failure = fetchFailureCopy(state);
              return (
                <div key={account.id} className="min-w-0 border-t border-ui-subtle pt-3 first:border-t-0 first:pt-0">
                  <p className="break-words text-[11px] text-ui-secondary">
                    {PROVIDERS[account.provider].name} · {account.label}
                  </p>
                  <p className="mt-2 text-[12px] font-semibold">{failure.title}</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-[12px] text-ui-secondary [overflow-wrap:anywhere]">
                    {failure.detail}
                  </p>
                  <p className="mt-2 text-[11px] text-ui-tertiary">
                    {state.previous
                      ? `Showing usage last fetched ${formatFetchedAt(state.previous.snapshot.fetchedAt)}.`
                      : "No usage has been fetched for this account yet."}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="small" onClick={() => onRefresh(account)}>Retry</Button>
                    <Button size="small" variant="transparent" onClick={() => {
                      onOpenChange(false);
                      onEdit(account);
                    }}>Edit account</Button>
                  </div>
                  <details className="mt-3 border-t border-ui-subtle pt-2 text-[11px]">
                    <summary className="cursor-pointer text-ui-secondary">Technical details</summary>
                    <pre className="mt-2 select-text whitespace-pre-wrap break-words rounded-md bg-ui-control p-2 text-ui-primary [overflow-wrap:anywhere]">
                      {state.message}
                    </pre>
                    <Button size="small" variant="transparent" className="mt-2" onClick={() => void copyError(account, state.message)}>
                      Copy error
                    </Button>
                  </details>
                </div>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
