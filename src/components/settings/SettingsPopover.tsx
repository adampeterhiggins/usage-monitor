import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import { Command } from "cmdk";
import { OPEN_SETTINGS_EVENT, WINDOW_SHOWN_EVENT } from "../../contracts/platform";
import { subscribe } from "../../platform/events";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Contrast,
  Keyboard,
  LayoutGrid,
  LayoutList,
  Layers,
  AlignJustify,
  Rows3,
  Columns2,
  Power,
  RefreshCw,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  getRefreshShortcut,
  getToggleShortcut,
  REFRESH_SHORTCUT_QUERY_KEY,
  setRefreshShortcut,
  setToggleShortcut,
} from "../../lib/settings/index";
import { openAppearanceWindow } from "../../platform/appearance-window";
import {
  acceleratorFromKeyDown,
  DEFAULT_REFRESH_SHORTCUT,
  DEFAULT_TOGGLE_SHORTCUT,
  formatAccelerator,
  toGlobalShortcut,
} from "../../lib/settings/shortcuts";
import { registerToggleShortcut } from "../../platform/global-shortcut";
import { toast } from "../ui/toast";
import { type Layout } from "../../lib/settings/layout";
import { exitApp } from "../../platform/app";
import { Tooltip } from "../ui/tooltip";
import { GithubAuthSettings } from "./GithubAuthSettings";
import { UpdatePanel } from "./UpdatePanel";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";


type Page = "root" | "layout" | "updates";

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
  onManageAccounts: () => void;
  dialogOpen: boolean;
  onOpenChange?: (open: boolean) => void;
  githubToken: string | null;
  onGithubTokenChange: (token: string | null) => void;
}

export function SettingsPopover({
  layout,
  onLayoutChange,
  onManageAccounts,
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

  const refreshShortcutQuery = useQuery({ queryKey: REFRESH_SHORTCUT_QUERY_KEY, queryFn: getRefreshShortcut });
  const refreshShortcut = refreshShortcutQuery.data ?? DEFAULT_REFRESH_SHORTCUT;
  const recordingAny = recordingShortcut || recordingRefreshShortcut;

  React.useEffect(() => {
    return subscribe(OPEN_SETTINGS_EVENT, () => setOpen(true));
  }, []);

  React.useEffect(() => subscribe(WINDOW_SHOWN_EVENT, () => setOpen(false)), []);

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
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  React.useEffect(() => {
    if (!open) return;
    contentRef.current?.querySelector<HTMLInputElement>("[cmdk-input]")?.focus();
  }, [open, page]);

  React.useEffect(() => {
    if (!open) return;
    void getToggleShortcut().then(setShortcut);
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

  const currentLayoutLabel = LAYOUT_OPTIONS.find((o) => o.id === layout)?.label ?? "Wall";

  return (
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
          data-ui-surface="menu"
          className="ui-surface z-50 w-80 overflow-hidden rounded-2xl p-0 shadow-lg ring-1 ring-ui-subtle"
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
                className="h-9 border-b border-ui-subtle bg-transparent px-3 text-[13px] text-ui-input-fg outline-none placeholder:text-ui-input-placeholder"
              />
            ) : null}
            <Command.List className="h-auto max-h-[320px] overflow-y-auto p-1">
              <Command.Empty className="px-3 py-6 text-center text-[12px] text-ui-tertiary">
                No actions found.
              </Command.Empty>
              {page === "root" && (
                <Command.Group>
                  <Item
                    icon={Users}
                    label="Manage Accounts…"
                    onSelect={() => {
                      onManageAccounts();
                      setOpen(false);
                    }}
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
                      void exitApp();
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
              {page === "updates" && (
                <div>
                  <UpdatePanel hasToken={!!githubToken} />
                  <GithubAuthSettings githubToken={githubToken} onGithubTokenChange={onGithubTokenChange} />
                </div>
              )}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

const itemClass =
  "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] outline-none data-[selected=true]:bg-ui-control-hover";

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
    <Command.Item disabled={disabled} onSelect={onSelect} className={cn(itemClass, disabled && "cursor-default opacity-40")}>
      <Icon className="size-4 text-ui-secondary" />
      <span className="flex-1">{label}</span>
      {accessory ? <span className="text-[11px] text-ui-tertiary">{accessory}</span> : null}
    </Command.Item>
  );
}
