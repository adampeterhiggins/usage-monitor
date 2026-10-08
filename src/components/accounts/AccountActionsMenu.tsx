import * as React from "react";
import {
  Activity,
  CircleAlert,
  Compass,
  Ellipsis,
  Pencil,
  RefreshCw,
  Ticket,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { openExternal } from "../../platform/external";
import { useAccountsStore } from "../../state/accounts";
import { toast } from "../ui/toast";
import { PROVIDERS } from "../../providers/metadata";
import { supportsResetCredits } from "../../providers/registry";
import { STATUS_PAGES, type StatusIndicator } from "../../providers/shared/status";
import { useProviderIssue } from "../../state/providerStatus";
import { ResetCreditsDialog } from "./ResetCreditsDialog";
import type { AccountPublic } from "../../contracts/accounts";
import type { ProviderId } from "../../contracts/providers";
import { Button } from "../ui/button";
import {
  MenuCommand,
  MENU_TONE_TEXT,
  MenuContent,
  MenuItem,
  type MenuItemTone,
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

const STATUS_TONES: Record<StatusIndicator, MenuItemTone | undefined> = {
  none: undefined,
  maintenance: "info",
  minor: "warning",
  major: "high",
  critical: "critical",
};

function openLink(url: string, failure: string) {
  void openExternal(url).catch((e) =>
    toast.error(failure, { description: e instanceof Error ? e.message : String(e) }),
  );
}

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
  const [showResets, setShowResets] = React.useState(false);
  const meta = PROVIDERS[account.provider];
  const issue = useProviderIssue(account.provider);
  const issueTone = issue && STATUS_TONES[issue.indicator];

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
            aria-label={issue ? `Account actions · ${meta.name}: ${issue.description}` : "Account actions"}
            title={issue ? `${meta.name}: ${issue.description}` : undefined}
            className={open ? "bg-ui-control" : undefined}
          >
            {issueTone ? (
              <CircleAlert className={`size-4 ${MENU_TONE_TEXT[issueTone]}`} />
            ) : (
              <Ellipsis className="size-4" />
            )}
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
              {supportsResetCredits(account.provider) ? (
                <MenuItem
                  icon={Ticket}
                  label="Usage Resets"
                  onSelect={() => {
                    setOpen(false);
                    setShowResets(true);
                  }}
                />
              ) : null}
              <MenuItem
                icon={Compass}
                label="Open Dashboard"
                onSelect={() => {
                  setOpen(false);
                  openLink(DASHBOARD_URLS[account.provider], "Couldn’t open dashboard");
                }}
              />
              <MenuItem
                icon={issue ? TriangleAlert : Activity}
                label={issue ? issue.description : "Status Page"}
                tone={issueTone}
                onSelect={() => {
                  setOpen(false);
                  openLink(STATUS_PAGES[account.provider], "Couldn’t open status page");
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

      {showResets ? (
        <ResetCreditsDialog
          account={account}
          onClose={() => setShowResets(false)}
          onReset={onRefresh}
        />
      ) : null}

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
