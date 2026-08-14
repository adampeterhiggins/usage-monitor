import * as React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Ellipsis } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { removeAccount } from "../lib/accounts";
import { toast } from "../lib/toast";
import { PROVIDERS, type AccountPublic, type ProviderId } from "../lib/usage-types";
import { Button } from "./ui";

const DASHBOARD_URLS: Record<ProviderId, string> = {
  claude: "https://claude.ai/settings/usage",
  codex: "https://chatgpt.com/codex/settings/usage",
  cursor: "https://cursor.com/dashboard",
};

interface AccountActionsMenuProps {
  account: AccountPublic;
  onEdit: (account: AccountPublic) => void;
  onRemoved: (accountId: string) => void;
  onRefresh: (account: AccountPublic) => void;
}

export function AccountActionsMenu({ account, onEdit, onRemoved, onRefresh }: AccountActionsMenuProps) {
  const [confirmRemove, setConfirmRemove] = React.useState(false);
  const meta = PROVIDERS[account.provider];

  async function handleRemove() {
    try {
      await removeAccount(account.id);
      toast.success("Account removed", { description: `${meta.name} · ${account.label}` });
      onRemoved(account.id);
      setConfirmRemove(false);
    } catch (e) {
      toast.error("Couldn’t remove account", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button iconOnly variant="transparent" size="small" aria-label="Account actions">
            <Ellipsis className="size-4" />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={4}
            className="z-50 min-w-40 rounded-xl bg-surface p-1 shadow-lg ring-1 ring-black/10"
          >
            <MenuItem onSelect={() => onRefresh(account)}>Refresh</MenuItem>
            <MenuItem onSelect={() => onEdit(account)}>Edit</MenuItem>
            <MenuItem
              onSelect={() => {
                void openUrl(DASHBOARD_URLS[account.provider]).catch((e) =>
                  toast.error("Couldn’t open dashboard", {
                    description: e instanceof Error ? e.message : String(e),
                  }),
                );
              }}
            >
              Open Dashboard
            </MenuItem>
            <DropdownMenu.Separator className="my-1 h-px bg-separator" />
            <MenuItem danger onSelect={() => setConfirmRemove(true)}>
              Remove
            </MenuItem>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {confirmRemove ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-6">
          <div className="w-full max-w-sm rounded-2xl bg-surface p-4 shadow-xl ring-1 ring-black/10">
            <div className="text-[15px] font-semibold">Remove {account.label}?</div>
            <p className="mt-1 text-[12px] text-secondary">
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
}: {
  children: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
}) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className={`flex cursor-default rounded-lg px-2.5 py-1.5 text-[13px] outline-none data-[highlighted]:bg-control-subtle ${
        danger ? "text-support-red" : "text-ink"
      }`}
    >
      {children}
    </DropdownMenu.Item>
  );
}
