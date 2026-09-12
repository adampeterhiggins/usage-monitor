import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import { Compass, Ellipsis, Pencil, RefreshCw, Trash2, type LucideIcon } from "lucide-react";
import { openExternal } from "../../platform/external";
import { useAccountsStore } from "../../state/accounts";
import { toast } from "../ui/toast";
import { PROVIDERS } from "../../providers/metadata";
import type { AccountPublic } from "../../contracts/accounts";
import type { ProviderId } from "../../contracts/providers";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";

const DASHBOARD_URLS: Record<ProviderId, string> = {
  claude: "https://claude.ai/settings/usage",
  codex: "https://chatgpt.com/codex/settings/usage",
  cursor: "https://cursor.com/dashboard",
};

interface AccountActionsMenuProps {
  account: AccountPublic;
  onEdit: (account: AccountPublic) => void;
  onRefresh: (account: AccountPublic) => void;
  triggerSize?: "small" | "medium";
}

export function AccountActionsMenu({
  account,
  onEdit,
  onRefresh,
  triggerSize = "small",
}: AccountActionsMenuProps) {
  const [open, setOpen] = React.useState(false);
  const [confirmRemove, setConfirmRemove] = React.useState(false);
  const meta = PROVIDERS[account.provider];

  async function handleRemove() {
    try {
      await useAccountsStore.getState().remove(account.id);
      toast.success("Account removed", { description: `${meta.name} · ${account.label}` });
      setConfirmRemove(false);
    } catch (e) {
      toast.error("Couldn’t remove account", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return (
    <>
      <Popover.Root modal={false} open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <Button
            iconOnly
            variant="transparent"
            size={triggerSize}
            aria-label="Account actions"
            className={open ? "bg-ui-control" : undefined}
          >
            <Ellipsis className="size-4" />
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="end"
            side="bottom"
            sideOffset={4}
            collisionPadding={8}
            onOpenAutoFocus={(event) => event.preventDefault()}
            data-ui-surface="menu"
            className="ui-surface z-[80] min-w-[176px] rounded-[12px] p-1 shadow-menu ring-1 ring-ui-subtle"
          >
            <MenuItem
              icon={RefreshCw}
              onSelect={() => {
                setOpen(false);
                onRefresh(account);
              }}
            >
              Refresh
            </MenuItem>
            <MenuItem
              icon={Pencil}
              onSelect={() => {
                setOpen(false);
                onEdit(account);
              }}
            >
              Edit
            </MenuItem>
            <MenuItem
              icon={Compass}
              onSelect={() => {
                setOpen(false);
                void openExternal(DASHBOARD_URLS[account.provider]).catch((e) =>
                  toast.error("Couldn’t open dashboard", {
                    description: e instanceof Error ? e.message : String(e),
                  }),
                );
              }}
            >
              Open Dashboard
            </MenuItem>
            <div className="mx-1.5 my-1 h-px bg-ui-subtle" />
            <MenuItem
              icon={Trash2}
              danger
              onSelect={() => {
                setOpen(false);
                setConfirmRemove(true);
              }}
            >
              Remove
            </MenuItem>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {confirmRemove ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center rounded-[16px] bg-ui-scrim p-6">
          <div data-ui-surface="menu"
            className="ui-surface w-full max-w-sm rounded-2xl p-4 shadow-xl ring-1 ring-ui-subtle">
            <div className="text-[15px] font-semibold">Remove {account.label}?</div>
            <p className="mt-1 text-[12px] text-ui-secondary">
              {meta.name} · {account.label} will be removed from this monitor. Your provider login is
              unaffected.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="glass" onClick={() => setConfirmRemove(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => void handleRemove()}>
                Remove
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function MenuItem({
  children,
  onSelect,
  danger,
  icon: Icon,
}: {
  children: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
  icon: LucideIcon;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[13px] outline-none hover:bg-ui-control-hover",
        danger ? "text-ui-status-critical-text" : "text-ui-primary",
      )}
    >
      <Icon className="size-3.5 shrink-0" strokeWidth={1.75} />
      {children}
    </button>
  );
}
