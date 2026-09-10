import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw } from "lucide-react";
import { AccountCard, type AccountFetchState } from "./components/account-card";
import { AccountDialog } from "./components/account-dialog";
import { AccountManagementDialog } from "./components/account-management-dialog";
import { FitCorner } from "./components/fit-corner";
import { FocusView } from "./components/focus-view";
import { LedgerView } from "./components/ledger-view";
import { DeploymentInfoButton } from "./components/deployment-info";
import { SettingsPopover } from "./components/settings-popover";
import { StripView } from "./components/strip-view";
import { ToastHost } from "./components/toast-host";
import { Tooltip } from "./components/tooltip";
import { Button, EmptyState, Text } from "./components/ui";
import { fetchAccountUsage, listAccounts } from "./lib/accounts";
import { initToggleShortcut } from "./lib/platform/global-shortcut";
import {
  getGithubToken,
  getLayout,
  getRefreshShortcut,
  getToggleShortcut,
  REFRESH_SHORTCUT_QUERY_KEY,
  setLayout as persistLayout,
} from "./lib/settings";
import { refreshAppliedAppearance } from "./lib/theme/controller";
import { ThemeEditorHost } from "./components/appearance/theme-editor-host";
import { AppearancePanel } from "./components/appearance/appearance-dialog";
import { APPEARANCE_CHANGED_EVENT } from "./lib/platform/appearance-window";
import { provideUpdateToken, useUpdates } from "./lib/updates/store";
import { acceleratorFromKeyDown, acceleratorGlyphs, DEFAULT_REFRESH_SHORTCUT } from "./lib/platform/shortcut";
import { PROVIDER_ORDER, PROVIDERS, type AccountPublic, type Layout } from "./lib/usage/types";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

const ACCOUNTS_KEY = ["usage", "accounts"] as const;

export default function App() {
  const label = getCurrentWindow().label;
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
  React.useEffect(() => {
    void refreshAppliedAppearance();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      void refreshAppliedAppearance();
    };
    media.addEventListener("change", onChange);
    return () => {
      media.removeEventListener("change", onChange);
      void invoke("appearance_window_closed");
    };
  }, []);

  return <AppearancePanel />;
}

function Shell() {
  const client = useQueryClient();
  const [layout, setLayout] = React.useState<Layout>("wall");
  const [focusSelectedId, setFocusSelectedId] = React.useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [manageOpen, setManageOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AccountPublic | null>(null);
  const blockingOverlay = dialogOpen || manageOpen || settingsOpen;
  const accountModalOpen = dialogOpen || manageOpen;
  const [fetchStates, setFetchStates] = React.useState<Record<string, AccountFetchState>>({});
  const [refreshingAll, setRefreshingAll] = React.useState(false);
  const [githubToken, setGithubTokenState] = React.useState<string | null>(null);
  const [, setTick] = React.useState(0);
  const headerRef = React.useRef<HTMLElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);

  const accountsQuery = useQuery({ queryKey: ACCOUNTS_KEY, queryFn: listAccounts });
  const accounts = accountsQuery.data ?? [];
  const refreshShortcutQuery = useQuery({ queryKey: REFRESH_SHORTCUT_QUERY_KEY, queryFn: getRefreshShortcut });
  const refreshShortcut = refreshShortcutQuery.data ?? DEFAULT_REFRESH_SHORTCUT;
  const startPoller = useUpdates((s) => s.startPoller);

  React.useEffect(() => {
    void (async () => {
      await refreshAppliedAppearance();
      setLayout(await getLayout());
      const token = await getGithubToken();
      setGithubTokenState(token);
      const saved = await getToggleShortcut();
      await initToggleShortcut(saved);
    })();
  }, []);

  React.useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      void refreshAppliedAppearance();
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  React.useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen(APPEARANCE_CHANGED_EVENT, () => {
      void refreshAppliedAppearance();
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  React.useEffect(() => {
    provideUpdateToken(() => githubToken);
  }, [githubToken]);

  React.useEffect(() => {
    // Do not send `open: false` from this effect's cleanup — React Strict Mode
    // remounts immediately and that race left the panel hidden / accessory
    // while the modal was still open.
    void invoke("set_account_modal_open", { open: accountModalOpen }).catch(() => {
      // Older native builds without the command keep tray hide-on-blur.
    });
  }, [accountModalOpen]);

  React.useEffect(() => {
    return () => {
      void invoke("set_account_modal_open", { open: false }).catch(() => {});
    };
  }, []);

  React.useEffect(() => startPoller(), [startPoller]);

  React.useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const loadOne = React.useCallback(async (account: AccountPublic, force: boolean) => {
    setFetchStates((prev) => {
      const current = prev[account.id];
      const previous =
        current?.status === "ok"
          ? current.result
          : current?.status === "error" || current?.status === "loading"
            ? current.previous
            : undefined;
      return { ...prev, [account.id]: { status: "loading", previous } };
    });
    try {
      const result = await fetchAccountUsage(account.id, force);
      setFetchStates((prev) => ({ ...prev, [account.id]: { status: "ok", result } }));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setFetchStates((prev) => {
        const current = prev[account.id];
        const previous =
          current?.status === "loading" || current?.status === "error"
            ? current.previous
            : current?.status === "ok"
              ? current.result
              : undefined;
        return { ...prev, [account.id]: { status: "error", message, previous } };
      });
    }
  }, []);

  const visibleAccounts = React.useMemo(() => accounts.filter((a) => !a.hidden), [accounts]);

  React.useEffect(() => {
    if (focusSelectedId && !visibleAccounts.some((a) => a.id === focusSelectedId)) {
      setFocusSelectedId(null);
    }
  }, [visibleAccounts, focusSelectedId]);

  React.useEffect(() => {
    for (const account of visibleAccounts) {
      if (!fetchStates[account.id]) void loadOne(account, false);
    }
  }, [visibleAccounts, fetchStates, loadOne]);

  const refreshAll = React.useCallback(
    async (force: boolean) => {
      if (visibleAccounts.length === 0) return;
      setRefreshingAll(true);
      try {
        await Promise.all(visibleAccounts.map((a) => loadOne(a, force)));
      } finally {
        setRefreshingAll(false);
      }
    },
    [visibleAccounts, loadOne],
  );

  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (blockingOverlay) return;
        void invoke("hide_window");
        return;
      }
      const accelerator = acceleratorFromKeyDown(e, { allowBareKey: true });
      if (!accelerator || accelerator !== refreshShortcut) return;
      if (blockingOverlay || visibleAccounts.length === 0 || refreshingAll) return;
      e.preventDefault();
      void refreshAll(true);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [refreshAll, blockingOverlay, visibleAccounts.length, refreshingAll, refreshShortcut]);

  React.useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen("window:shown", () => {
      // Make sure the document owns keyboard focus so Escape works without a click first.
      window.focus();
      if (dialogOpen || manageOpen || visibleAccounts.length === 0 || refreshingAll) return;
      // Respect TTL / backoff. A forced refresh here re-hit Claude's OAuth
      // token endpoint on every tray open and burned the sign-in rate limit.
      void refreshAll(false);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, [refreshAll, dialogOpen, manageOpen, visibleAccounts.length, refreshingAll]);

  function handleSaved() {
    void client.invalidateQueries({ queryKey: ACCOUNTS_KEY });
    setFetchStates({});
  }

  function handleRemoved(accountId: string) {
    void client.invalidateQueries({ queryKey: ACCOUNTS_KEY });
    if (focusSelectedId === accountId) setFocusSelectedId(null);
  }

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(account: AccountPublic) {
    setEditing(account);
    setManageOpen(true);
    setDialogOpen(true);
  }

  function changeLayout(next: Layout) {
    setLayout(next);
    void persistLayout(next);
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
  const isEmpty = !accountsQuery.isLoading && accounts.length === 0;
  const allHidden = !isEmpty && !accountsQuery.isLoading && visibleAccounts.length === 0;

  function renderBody() {
    if (accountsQuery.isLoading) {
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
            onRemoved={handleRemoved}
            onRefresh={(a) => void loadOne(a, true)}
          />
        );
      case "strip":
        return (
          <StripView
            grouped={grouped}
            fetchStates={fetchStates}
            onEdit={openEdit}
            onRemoved={handleRemoved}
            onRefresh={(a) => void loadOne(a, true)}
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
            onRemoved={handleRemoved}
            onRefresh={(a) => void loadOne(a, true)}
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
                      onRemoved={handleRemoved}
                      onRefresh={(a) => void loadOne(a, true)}
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
                onRemoved={handleRemoved}
                onRefresh={(a) => void loadOne(a, true)}
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
    ) : layout === "focus" && !accountsQuery.isLoading ? (
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
          void getCurrentWindow().startDragging();
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
            onGithubTokenChange={setGithubTokenState}
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
        onAccountsChanged={() => {
          void client.invalidateQueries({ queryKey: ACCOUNTS_KEY });
        }}
      />
      <AccountDialog open={dialogOpen} onOpenChange={setDialogOpen} account={editing} onSaved={handleSaved} />
    </div>
  );
}
