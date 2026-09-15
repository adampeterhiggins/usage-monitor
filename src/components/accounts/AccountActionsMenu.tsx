import * as React from "react";
import { Compass, Ellipsis, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { openExternal } from "../../platform/external";
import { useAccountsStore } from "../../state/accounts";
import { toast } from "../ui/toast";
import { PROVIDERS } from "../../providers/metadata";
import type { AccountPublic } from "../../contracts/accounts";
import type { ProviderId } from "../../contracts/providers";
import { Button } from "../ui/button";
import {
  MenuCommand,
  MenuContent,
  MenuItem,
  MenuList,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";

const DASHBOARD_URLS: Record<ProviderId, string> = {
  claude: "https://claude.ai/settings/usage",
  codex: "https://chatgpt.com/codex/settings/usage",
  cursor: "https://cursor.com/dashboard",
  devin: "https://app.devin.ai/settings/usage",
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
      <MenuRoot open={open} onOpenChange={setOpen}>
        <MenuTrigger asChild>
          <Button
            iconOnly
            variant="transparent"
            size={triggerSize}
            aria-label="Account actions"
            className={open ? "bg-ui-control" : undefined}
          >
            <Ellipsis className="size-4" />
          </Button>
        </MenuTrigger>
        <MenuContent
          align="end"
          side="bottom"
          sideOffset={4}
          collisionPadding={8}
          className="z-[80] min-w-[176px] rounded-[12px] shadow-menu"
        >
          <MenuCommand>
            <MenuList className="p-1">
              <MenuItem
                icon={RefreshCw}
                label="Refresh"
                onSelect={() => {
                  setOpen(false);
                  onRefresh(account);
                }}
              />
              <MenuItem
                icon={Pencil}
                label="Edit"
                onSelect={() => {
                  setOpen(false);
                  onEdit(account);
                }}
              />
              <MenuItem
                icon={Compass}
                label="Open Dashboard"
                onSelect={() => {
                  setOpen(false);
                  void openExternal(DASHBOARD_URLS[account.provider]).catch((e) =>
                    toast.error("Couldn’t open dashboard", {
                      description: e instanceof Error ? e.message : String(e),
                    }),
                  );
                }}
              />
              <MenuSeparator />
              <MenuItem
                icon={Trash2}
                label="Remove"
                danger
                onSelect={() => {
                  setOpen(false);
                  setConfirmRemove(true);
                }}
              />
            </MenuList>
          </MenuCommand>
        </MenuContent>
      </MenuRoot>

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
