/** The tray panel window — accounts, usage, layouts, and the panel
 *  lifecycle (toggle shortcut, modal bridge, shown refresh, ticking
 *  timestamps, updater polling). */

import * as React from "react";
import { Plus, RefreshCw } from "lucide-react";

import { AccountDialog } from "../components/accounts/AccountDialog";
import { AccountManagementDialog } from "../components/accounts/AccountManagementDialog";
import { DeploymentInfoButton } from "../components/settings/DeploymentInfo";
import { SettingsPopover } from "../components/settings/SettingsPopover";
import { FitCorner } from "../components/ui/FitCorner";
import { Tooltip } from "../components/ui/tooltip";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { groupByProvider } from "../components/views/accountGrouping";
import { UsageLayout } from "../components/views/UsageLayout";
import type { AccountPublic } from "../contracts/accounts";
import { useAppearanceRefresh } from "../hooks/useAppearanceRefresh";
import {
  useIntervalTick,
  useModalOpenBridge,
  useToggleShortcut,
  useWindowShownRefresh,
} from "../hooks/usePanelLifecycle";
import { usePanelKeys } from "../hooks/usePanelKeys";
import { useUpdaterPoller } from "../hooks/useUpdaterPoller";
import { useAccountsStore } from "../state/accounts";
import { acceleratorGlyphs } from "../lib/settings/shortcuts";
import { startPanelDragging } from "../platform/windows";
import { useLayout, useRefreshShortcut } from "../state/preferences";
import { useUsageStore } from "../state/usage";

export function PanelApp() {
  const [focusSelectedId, setFocusSelectedId] = React.useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [manageOpen, setManageOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AccountPublic | null>(null);
  const blockingOverlay = dialogOpen || manageOpen || settingsOpen;
  const accountModalOpen = dialogOpen || manageOpen;
  const headerRef = React.useRef<HTMLElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);

  const accounts = useAccountsStore((s) => s.accounts);
  const accountsLoaded = useAccountsStore((s) => s.loaded);
  const fetchStates = useUsageStore((s) => s.states);
  const refreshingAll = useUsageStore((s) => s.refreshingAll);
  const visibleAccounts = React.useMemo(() => accounts.filter((a) => !a.hidden), [accounts]);

  const [layout, changeLayout] = useLayout();
  const refreshShortcut = useRefreshShortcut();
  useAppearanceRefresh();
  useToggleShortcut();
  useUpdaterPoller();
  useModalOpenBridge(accountModalOpen);
  useIntervalTick(30_000);

  React.useEffect(() => {
    void useAccountsStore.getState().refresh();
  }, []);

  React.useEffect(() => {
    useUsageStore.getState().ensureLoaded(visibleAccounts);
  }, [visibleAccounts]);

  const loadOne = React.useCallback(
    (account: AccountPublic) => useUsageStore.getState().load(account.id, true),
    [],
  );
  const refreshAll = React.useCallback(
    (force: boolean) => useUsageStore.getState().refreshAll(visibleAccounts, force),
    [visibleAccounts],
  );

  usePanelKeys({
    refreshShortcut,
    blockingOverlay,
    canRefresh: visibleAccounts.length > 0 && !refreshingAll,
    onRefreshAll: () => void refreshAll(true),
  });
  useWindowShownRefresh({
    skip: accountModalOpen || visibleAccounts.length === 0 || refreshingAll,
    onShown: () => void refreshAll(false),
  });

  React.useEffect(() => {
    if (focusSelectedId && !visibleAccounts.some((a) => a.id === focusSelectedId)) {
      setFocusSelectedId(null);
    }
  }, [visibleAccounts, focusSelectedId]);

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(account: AccountPublic) {
    setEditing(account);
    setManageOpen(true);
    setDialogOpen(true);
  }

  const grouped = React.useMemo(() => groupByProvider(visibleAccounts), [visibleAccounts]);

  // Wall / Ledger follow persisted account order; provider-grouped layouts keep storage order within each provider.
  const isEmpty = accountsLoaded && accounts.length === 0;
  const allHidden = !isEmpty && accountsLoaded && visibleAccounts.length === 0;

  function renderBody() {
    if (!accountsLoaded) {
      return (
        <div className="grid grid-cols-2 gap-3 p-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl bg-ui-control" />
          ))}
        </div>
      );
    }
    if (isEmpty) {
      return (
        <EmptyState
          title="No accounts yet"
          description="Add a Claude, Codex, or Cursor account to start tracking usage allowances. Claude and Codex can use your existing local login with no paste."
          actions={
            <Button variant="accent" onClick={openAdd}>
              <Plus className="size-4" />
              Add Account
            </Button>
          }
        />
      );
    }
    if (allHidden) {
      return (
        <EmptyState
          title="All accounts hidden"
          description="Every account is hidden from view. Open Settings → Manage Accounts to show one again."
          actions={
            <Button variant="accent" onClick={() => setManageOpen(true)}>
              Manage Accounts
            </Button>
          }
        />
      );
    }

    return (
      <UsageLayout
        layout={layout}
        accounts={visibleAccounts}
        grouped={grouped}
        fetchStates={fetchStates}
        focusSelectedId={focusSelectedId}
        onFocusSelectedIdChange={setFocusSelectedId}
        onEdit={openEdit}
        onRefresh={loadOne}
      />
    );
  }

  const body = renderBody();
  const scrolledBody =
    isEmpty || allHidden ? (
      <div ref={contentRef} className="h-full">
        {body}
      </div>
    ) : layout === "focus" && accountsLoaded ? (
      <div ref={contentRef} className="h-full">
        {body}
      </div>
    ) : (
      <div className="h-full overflow-y-auto">
        <div ref={contentRef}>{body}</div>
      </div>
    );

  return (
    <div className="app-shell relative flex flex-col">
      <header
        ref={headerRef}
        data-ui-surface="toolbar"
        className="ui-toolbar drag-region flex h-13 cursor-grab items-center justify-between px-4 active:cursor-grabbing"
        data-tauri-drag-region
        onMouseDown={(event) => {
          if (event.button !== 0) return;
          const target = event.target as HTMLElement | null;
          if (target?.closest(".no-drag")) return;
          startPanelDragging();
        }}
      >
        <div data-tauri-drag-region className="min-w-0 flex-1">
          <div className="text-[18px] font-medium leading-6 tracking-[-0.11px]">AI Usage</div>
        </div>
        <div className="no-drag flex items-center gap-1.5">
          <Tooltip label="Refresh All" shortcut={acceleratorGlyphs(refreshShortcut)}>
            <span className="inline-flex">
              <Button
                iconOnly
                variant="glass"
                size="large"
                aria-label="Refresh all"
                disabled={accounts.length === 0 || refreshingAll}
                onClick={() => void refreshAll(true)}
              >
                <RefreshCw className={`size-4 ${refreshingAll ? "animate-spin" : ""}`} />
              </Button>
            </span>
          </Tooltip>
          <DeploymentInfoButton />
          <SettingsPopover
            layout={layout}
            onLayoutChange={changeLayout}
            onManageAccounts={() => setManageOpen(true)}
            dialogOpen={blockingOverlay}
            onOpenChange={setSettingsOpen}
          />
        </div>
      </header>
      <div className="@container min-h-0 flex-1">{scrolledBody}</div>
      <FitCorner contentRef={contentRef} headerRef={headerRef} />
      <AccountManagementDialog
        open={manageOpen}
        onOpenChange={(open) => {
          if (!open && dialogOpen) return;
          setManageOpen(open);
        }}
        accounts={accounts}
        onAddAccount={openAdd}
        onEditAccount={openEdit}
      />
      <AccountDialog open={dialogOpen} onOpenChange={setDialogOpen} account={editing} />
    </div>
  );
}
