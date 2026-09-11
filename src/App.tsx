import * as React from "react";
import { notifyAppearanceClosed } from "./lib/platform/appearance-window";
import { currentWindowLabel, startPanelDragging } from "./lib/platform/windows";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Plus, RefreshCw } from "lucide-react";
import { AccountCard } from "./components/accounts/account-card";
import { AccountDialog } from "./components/accounts/account-dialog";
import { AccountManagementDialog } from "./components/accounts/account-management-dialog";
import { FitCorner } from "./components/ui/fit-corner";
import { FocusView } from "./components/views/focus-view";
import { LedgerView } from "./components/views/ledger-view";
import { DeploymentInfoButton } from "./components/settings/deployment-info";
import { SettingsPopover } from "./components/settings/settings-popover";
import { StripView } from "./components/views/strip-view";
import { ToastHost } from "./components/ui/toast-host";
import { Tooltip } from "./components/ui/tooltip";
import { Button, EmptyState, Text } from "./components/ui";
import { ThemeEditorHost } from "./components/appearance/theme-editor-host";
import { AppearancePanel } from "./components/appearance/appearance-dialog";
import { useAppearanceRefresh } from "./hooks/appearance";
import {
  useIntervalTick,
  useLayout,
  useModalOpenBridge,
  usePanelKeys,
  useRefreshShortcut,
  useToggleShortcut,
  useWindowShownRefresh,
} from "./hooks/panel";
import { useGithubToken, useUpdaterPoller } from "./hooks/updater";
import { useAccountsStore } from "./lib/accounts";
import { acceleratorGlyphs } from "./lib/platform/shortcut";
import { useUsageStore } from "./lib/usage/service";
import type { AccountPublic } from "./lib/contracts/accounts";
import { PROVIDER_ORDER, PROVIDERS } from "./lib/auth/provider-meta";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

export default function App() {
  const label = currentWindowLabel();
  const isAppearanceWindow = label === "appearance";

  React.useEffect(() => {
    document.documentElement.dataset.window = label;
  }, [label]);

  return (
    <QueryClientProvider client={queryClient}>
      {isAppearanceWindow ? <AppearanceWindowApp /> : <Shell />}
      <ToastHost />
      {isAppearanceWindow ? <ThemeEditorHost /> : null}
    </QueryClientProvider>
  );
}

function AppearanceWindowApp() {
  useAppearanceRefresh({ listenForExternalChanges: false });

  React.useEffect(() => {
    return () => {
      void notifyAppearanceClosed();
    };
  }, []);

  return <AppearancePanel />;
}

function Shell() {
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
  const [githubToken, setGithubToken] = useGithubToken();
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

  const grouped = React.useMemo(() => {
    const map = new Map<string, AccountPublic[]>();
    for (const id of PROVIDER_ORDER) map.set(id, []);
    for (const account of visibleAccounts) {
      const list = map.get(account.provider) ?? [];
      list.push(account);
      map.set(account.provider, list);
    }
    return PROVIDER_ORDER.map((id) => ({ id, accounts: map.get(id) ?? [] })).filter((g) => g.accounts.length > 0);
  }, [visibleAccounts]);

  // Wall / Ledger follow persisted account order; provider-grouped layouts keep storage order within each provider.
  const orderedAccounts = visibleAccounts;
  const isEmpty = accountsLoaded && accounts.length === 0;
  const allHidden = !isEmpty && accountsLoaded && visibleAccounts.length === 0;

  function renderBody() {
    if (!accountsLoaded) {
      return (
        <div className="grid grid-cols-2 gap-3 p-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl bg-control-subtle" />
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

    switch (layout) {
      case "ledger":
        return (
          <LedgerView
            accounts={orderedAccounts}
            fetchStates={fetchStates}
            onEdit={openEdit}
            onRefresh={loadOne}
          />
        );
      case "strip":
        return (
          <StripView
            grouped={grouped}
            fetchStates={fetchStates}
            onEdit={openEdit}
            onRefresh={loadOne}
          />
        );
      case "focus":
        return (
          <FocusView
            grouped={grouped}
            fetchStates={fetchStates}
            selectedId={focusSelectedId}
            onSelectedIdChange={setFocusSelectedId}
            onEdit={openEdit}
            onRefresh={loadOne}
          />
        );
      case "grouped":
      case "stacked":
        return (
          <div className="flex flex-col gap-5 p-4 pb-8">
            {grouped.map((group) => (
              <section key={group.id} className="flex flex-col gap-2.5">
                <div className="flex items-baseline justify-between px-0.5">
                  <Text variant="small-strong" color="secondary">
                    {PROVIDERS[group.id].name}
                  </Text>
                  <Text variant="mini" color="quaternary">
                    {group.accounts.length}
                  </Text>
                </div>
                <div className={layout === "stacked" ? "grid grid-cols-1 gap-3" : "grid grid-cols-2 gap-3"}>
                  {group.accounts.map((account) => (
                    <AccountCard
                      key={account.id}
                      account={account}
                      state={fetchStates[account.id] ?? { status: "loading" }}
                      onEdit={openEdit}
                                onRefresh={loadOne}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        );
      case "wall":
      default:
        return (
          <div className="grid grid-cols-2 gap-3 p-4">
            {orderedAccounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                state={fetchStates[account.id] ?? { status: "loading" }}
                onEdit={openEdit}
                    onRefresh={loadOne}
              />
            ))}
          </div>
        );
    }
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
        className="drag-region flex h-13 cursor-grab items-center justify-between px-4 active:cursor-grabbing"
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
            githubToken={githubToken}
            onGithubTokenChange={setGithubToken}
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
