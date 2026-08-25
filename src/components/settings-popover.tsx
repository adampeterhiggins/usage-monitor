import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import { Command } from "cmdk";
import { listen } from "@tauri-apps/api/event";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Contrast,
  Eye,
  EyeOff,
  Keyboard,
  LayoutGrid,
  LayoutList,
  Layers,
  AlignJustify,
  Rows3,
  Columns2,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Settings,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import {
  getGithubToken,
  getRefreshShortcut,
  getToggleShortcut,
  importTokenFromGhCli,
  REFRESH_SHORTCUT_QUERY_KEY,
  setGithubToken,
  setRefreshShortcut,
  setToggleShortcut,
} from "../lib/settings";
import { openAppearanceWindow } from "../lib/appearance-window";
import { setAccountHidden, removeAccount } from "../lib/accounts";
import {
  acceleratorFromKeyDown,
  DEFAULT_REFRESH_SHORTCUT,
  DEFAULT_TOGGLE_SHORTCUT,
  formatAccelerator,
  toGlobalShortcut,
} from "../lib/shortcut";
import { registerToggleShortcut } from "../lib/global-shortcut";
import { toast } from "../lib/toast";
import { PROVIDERS, type AccountPublic, type Layout } from "../lib/usage-types";
import { exit } from "@tauri-apps/plugin-process";
import { Tooltip } from "./tooltip";
import { UpdatePanel } from "./update-panel";
import { Badge, Button, cn } from "./ui";

const OPEN_SETTINGS_EVENT = "settings:openPopover";
const WINDOW_SHOWN_EVENT = "window:shown";

type Page = "root" | "layout" | "editAccount" | "removeAccount" | "selectAccounts" | "updates";

const LAYOUT_OPTIONS: Array<{ id: Layout; label: string; icon: LucideIcon }> = [
  { id: "wall", label: "Wall", icon: LayoutGrid },
  { id: "grouped", label: "Grouped", icon: Layers },
  { id: "stacked", label: "Stacked", icon: LayoutList },
  { id: "ledger", label: "Ledger", icon: AlignJustify },
  { id: "strip", label: "Strip", icon: Rows3 },
  { id: "focus", label: "Focus", icon: Columns2 },
];

function useShortcutRecorder(
  recording: boolean,
  onCancel: () => void,
  onRecorded: (accelerator: string) => void,
  allowBareKey = false,
) {
  React.useEffect(() => {
    if (!recording) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        onCancel();
        return;
      }
      const accelerator = acceleratorFromKeyDown(event, { allowBareKey });
      if (!accelerator) return;
      onRecorded(accelerator);
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [recording, onCancel, onRecorded, allowBareKey]);
}

interface SettingsPopoverProps {
  layout: Layout;
  onLayoutChange: (layout: Layout) => void;
  accounts: AccountPublic[];
  onAddAccount: () => void;
  onEditAccount: (account: AccountPublic) => void;
  onAccountRemoved: (accountId: string) => void;
  onAccountVisibilityChanged: () => void;
  dialogOpen: boolean;
  onOpenChange?: (open: boolean) => void;
  githubToken: string | null;
  onGithubTokenChange: (token: string | null) => void;
}

export function SettingsPopover({
  layout,
  onLayoutChange,
  accounts,
  onAddAccount,
  onEditAccount,
  onAccountRemoved,
  onAccountVisibilityChanged,
  dialogOpen,
  onOpenChange,
  githubToken,
  onGithubTokenChange,
}: SettingsPopoverProps) {
  const queryClient = useQueryClient();
  const contentRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const [open, setOpen] = React.useState(false);
  const [page, setPage] = React.useState<Page>("root");
  const [query, setQuery] = React.useState("");
  const [shortcut, setShortcut] = React.useState(DEFAULT_TOGGLE_SHORTCUT);
  const [recordingShortcut, setRecordingShortcut] = React.useState(false);
  const [recordingRefreshShortcut, setRecordingRefreshShortcut] = React.useState(false);
  const [removeCandidate, setRemoveCandidate] = React.useState<AccountPublic | null>(null);
  const [tokenDraft, setTokenDraft] = React.useState("");

  const refreshShortcutQuery = useQuery({ queryKey: REFRESH_SHORTCUT_QUERY_KEY, queryFn: getRefreshShortcut });
  const refreshShortcut = refreshShortcutQuery.data ?? DEFAULT_REFRESH_SHORTCUT;
  const recordingAny = recordingShortcut || recordingRefreshShortcut;

  React.useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen(OPEN_SETTINGS_EVENT, () => setOpen(true)).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  React.useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen(WINDOW_SHOWN_EVENT, () => {
      setOpen(false);
      setRemoveCandidate(null);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      if (dialogOpen) return;
      event.preventDefault();
      setOpen((prev) => (prev && recordingAny ? prev : !prev));
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dialogOpen, recordingAny]);

  React.useEffect(() => {
    if (open) {
      setPage("root");
      setQuery("");
    }
  }, [open]);

  React.useEffect(() => {
    onOpenChange?.(open || removeCandidate !== null);
  }, [open, removeCandidate, onOpenChange]);

  React.useEffect(() => {
    if (!open) return;
    contentRef.current?.querySelector<HTMLInputElement>("[cmdk-input]")?.focus();
  }, [open, page]);

  React.useEffect(() => {
    if (!open) return;
    void getToggleShortcut().then(setShortcut);
    void getGithubToken().then((t) => setTokenDraft(t ?? ""));
  }, [open]);

  const applyShortcut = React.useCallback(async (accelerator: string) => {
    setRecordingShortcut(false);
    try {
      const ok = await registerToggleShortcut(toGlobalShortcut(accelerator));
      if (ok) {
        await setToggleShortcut(accelerator);
        setShortcut(accelerator);
        toast.success(`Shortcut set to ${formatAccelerator(accelerator)}`);
      } else {
        toast.error(`${formatAccelerator(accelerator)} is already in use — kept the previous shortcut.`);
      }
    } catch (error) {
      toast.error(`Failed to update shortcut: ${error}`);
    }
  }, []);

  const applyRefreshShortcut = React.useCallback(
    async (accelerator: string) => {
      setRecordingRefreshShortcut(false);
      const previous = queryClient.getQueryData<string>(REFRESH_SHORTCUT_QUERY_KEY) ?? DEFAULT_REFRESH_SHORTCUT;
      queryClient.setQueryData(REFRESH_SHORTCUT_QUERY_KEY, accelerator);
      try {
        await setRefreshShortcut(accelerator);
        toast.success(`Refresh shortcut set to ${formatAccelerator(accelerator)}`);
      } catch (error) {
        queryClient.setQueryData(REFRESH_SHORTCUT_QUERY_KEY, previous);
        toast.error(`Failed to update refresh shortcut: ${error}`);
      }
    },
    [queryClient],
  );

  useShortcutRecorder(
    recordingRefreshShortcut,
    () => setRecordingRefreshShortcut(false),
    (accelerator) => void applyRefreshShortcut(accelerator),
    true,
  );
  useShortcutRecorder(
    recordingShortcut,
    () => setRecordingShortcut(false),
    (accelerator) => void applyShortcut(accelerator),
  );

  async function handleToggleHidden(account: AccountPublic) {
    try {
      await setAccountHidden(account.id, !account.hidden);
      onAccountVisibilityChanged();
    } catch (error) {
      toast.error("Couldn’t update account visibility", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function handleConfirmRemove() {
    if (!removeCandidate) return;
    const meta = PROVIDERS[removeCandidate.provider];
    try {
      await removeAccount(removeCandidate.id);
      toast.success("Account removed", { description: `${meta.name} · ${removeCandidate.label}` });
      onAccountRemoved(removeCandidate.id);
      setRemoveCandidate(null);
    } catch (error) {
      toast.error("Couldn’t remove account", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const currentLayoutLabel = LAYOUT_OPTIONS.find((o) => o.id === layout)?.label ?? "Wall";

  return (
    <>
      <Popover.Root
        modal={false}
        open={open}
        onOpenChange={(next) => {
          if (!next && recordingAny) return;
          setOpen(next);
        }}
      >
        <Tooltip label="Settings" shortcut={["⌘", "K"]} disabled={open}>
          <span className="inline-flex">
            <Popover.Trigger asChild>
              <Button ref={triggerRef} iconOnly variant="glass" size="large" aria-label="Settings">
                <Settings className="size-4" />
              </Button>
            </Popover.Trigger>
          </span>
        </Tooltip>
        <Popover.Portal>
          <Popover.Content
            ref={contentRef}
            align="end"
            sideOffset={6}
            className="z-50 w-80 overflow-hidden rounded-2xl bg-surface p-0 shadow-lg ring-1 ring-black/10"
            onEscapeKeyDown={(event) => {
              event.stopPropagation();
              if (page !== "root") {
                event.preventDefault();
                setPage("root");
              }
            }}
          >
            <Command
              loop
              className="flex flex-col"
              onKeyDown={(event: React.KeyboardEvent) => {
                if (event.key === "Backspace" && query === "" && page !== "root") {
                  event.preventDefault();
                  setPage("root");
                }
              }}
            >
              {page !== "updates" ? (
                <Command.Input
                  placeholder="Search for actions…"
                  value={query}
                  onValueChange={setQuery}
                  className="h-9 border-b border-separator bg-transparent px-3 text-[13px] outline-none placeholder:text-quaternary"
                />
              ) : null}
              <Command.List className="h-auto max-h-[320px] overflow-y-auto p-1">
                <Command.Empty className="px-3 py-6 text-center text-[12px] text-tertiary">
                  No actions found.
                </Command.Empty>
                {page === "root" && (
                  <Command.Group>
                    <Item
                      icon={Plus}
                      label="Add Account"
                      onSelect={() => {
                        onAddAccount();
                        setOpen(false);
                      }}
                    />
                    <Item
                      icon={Pencil}
                      label="Edit Account…"
                      disabled={accounts.length === 0}
                      onSelect={() => setPage("editAccount")}
                    />
                    <Item
                      icon={Trash2}
                      label="Remove Account…"
                      disabled={accounts.length === 0}
                      onSelect={() => setPage("removeAccount")}
                    />
                    <Item
                      icon={Eye}
                      label="Select Accounts…"
                      disabled={accounts.length === 0}
                      onSelect={() => setPage("selectAccounts")}
                    />
                    <Item
                      icon={LayoutGrid}
                      label="Switch Layout…"
                      accessory={currentLayoutLabel}
                      onSelect={() => setPage("layout")}
                    />
                    <Item
                      icon={Contrast}
                      label="Appearance…"
                      onSelect={() => {
                        setOpen(false);
                        void openAppearanceWindow();
                      }}
                    />
                    <Item
                      icon={RefreshCw}
                      label="Refresh Command"
                      accessory={
                        recordingRefreshShortcut ? "Press keys… (Esc)" : formatAccelerator(refreshShortcut)
                      }
                      onSelect={() => setRecordingRefreshShortcut((prev) => !prev)}
                    />
                    <Item
                      icon={Keyboard}
                      label="Show/Hide Shortcut"
                      accessory={recordingShortcut ? "Press keys… (Esc)" : formatAccelerator(shortcut)}
                      onSelect={() => setRecordingShortcut((prev) => !prev)}
                    />
                    <Item icon={RefreshCw} label="Updates…" onSelect={() => setPage("updates")} />
                    <Item
                      icon={Power}
                      label="Quit"
                      onSelect={() => {
                        void exit(0);
                      }}
                    />
                  </Command.Group>
                )}
                {page === "layout" &&
                  LAYOUT_OPTIONS.map(({ id, label, icon }) => (
                    <Item
                      key={id}
                      icon={icon}
                      label={label}
                      accessory={id === layout ? "✓" : undefined}
                      onSelect={() => {
                        onLayoutChange(id);
                        setPage("root");
                      }}
                    />
                  ))}
                {page === "editAccount" &&
                  accounts.map((account) => (
                    <Command.Item
                      key={account.id}
                      onSelect={() => {
                        onEditAccount(account);
                        setOpen(false);
                      }}
                      className={itemClass}
                    >
                      <Badge color={PROVIDERS[account.provider].accent}>{PROVIDERS[account.provider].name}</Badge>
                      {account.label}
                    </Command.Item>
                  ))}
                {page === "removeAccount" &&
                  accounts.map((account) => (
                    <Command.Item
                      key={account.id}
                      onSelect={() => {
                        setRemoveCandidate(account);
                        setPage("root");
                        setOpen(false);
                      }}
                      className={itemClass}
                    >
                      <Badge color={PROVIDERS[account.provider].accent}>{PROVIDERS[account.provider].name}</Badge>
                      {account.label}
                    </Command.Item>
                  ))}
                {page === "selectAccounts" &&
                  accounts.map((account) => (
                    <Command.Item
                      key={account.id}
                      onSelect={() => void handleToggleHidden(account)}
                      className={itemClass}
                    >
                      <Badge color={PROVIDERS[account.provider].accent}>{PROVIDERS[account.provider].name}</Badge>
                      <span className={account.hidden ? "text-tertiary" : undefined}>{account.label}</span>
                      <span className="ml-auto">
                        {account.hidden ? (
                          <EyeOff className="size-4 text-tertiary" />
                        ) : (
                          <Check className="size-4" />
                        )}
                      </span>
                    </Command.Item>
                  ))}
                {page === "updates" && (
                  <div>
                    <UpdatePanel hasToken={!!githubToken} />
                    <div className="border-t border-separator px-3 py-2">
                      <div className="mb-1 text-[12px] font-semibold">GitHub token</div>
                      <p className="mb-2 text-[11px] text-tertiary">
                        Needed to download updates from the private repository. Import from the gh CLI or paste a
                        PAT with repo read access.
                      </p>
                      <input
                        type="password"
                        value={tokenDraft}
                        onChange={(e) => setTokenDraft(e.target.value)}
                        placeholder="ghp_…"
                        className="mb-2 h-8 w-full rounded-lg border border-separator bg-surface px-2 text-[12px]"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="small"
                          variant="glass"
                          onClick={() => {
                            void importTokenFromGhCli().then(async (token) => {
                              if (!token) {
                                toast.error("Couldn’t import from gh CLI");
                                return;
                              }
                              await setGithubToken(token);
                              setTokenDraft(token);
                              onGithubTokenChange(token);
                              toast.success("Imported GitHub token from gh");
                            });
                          }}
                        >
                          Import from gh
                        </Button>
                        <Button
                          size="small"
                          variant="accent"
                          onClick={() => {
                            void (async () => {
                              if (!tokenDraft.trim()) return;
                              await setGithubToken(tokenDraft.trim());
                              onGithubTokenChange(tokenDraft.trim());
                              toast.success("GitHub token saved");
                            })();
                          }}
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </Command.List>
            </Command>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {removeCandidate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-6">
          <div className="w-full max-w-sm rounded-2xl bg-surface p-4 shadow-xl ring-1 ring-black/10">
            <div className="text-[15px] font-semibold">Remove {removeCandidate.label}?</div>
            <p className="mt-1 text-[12px] text-secondary">
              {PROVIDERS[removeCandidate.provider].name} · {removeCandidate.label} will be removed from this
              monitor.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="glass" onClick={() => setRemoveCandidate(null)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => void handleConfirmRemove()}>
                Remove
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

const itemClass =
  "flex cursor-default items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] outline-none data-[selected=true]:bg-control-subtle";

function Item({
  icon: Icon,
  label,
  accessory,
  disabled,
  onSelect,
}: {
  icon: LucideIcon;
  label: string;
  accessory?: string;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <Command.Item disabled={disabled} onSelect={onSelect} className={cn(itemClass, disabled && "opacity-40")}>
      <Icon className="size-4 text-secondary" />
      <span className="flex-1">{label}</span>
      {accessory ? <span className="text-[11px] text-tertiary">{accessory}</span> : null}
    </Command.Item>
  );
}
