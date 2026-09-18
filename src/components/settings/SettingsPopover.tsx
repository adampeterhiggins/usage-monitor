import * as React from "react";
import { OPEN_SETTINGS_EVENT, WINDOW_SHOWN_EVENT } from "../../contracts/platform";
import { subscribe } from "../../platform/events";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  Contrast,
  Eye,
  Info,
  Keyboard,
  LayoutGrid,
  LayoutList,
  Layers,
  AlignJustify,
  Rows3,
  RotateCcw,
  Columns2,
  Columns3,
  Columns4,
  RectangleVertical,
  Power,
  RefreshCw,
  Scaling,
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
import { restoreDefaultPanelSize } from "../../platform/windows";
import {
  acceleratorFromKeyDown,
  DEFAULT_REFRESH_SHORTCUT,
  DEFAULT_TOGGLE_SHORTCUT,
  formatAccelerator,
  toGlobalShortcut,
} from "../../lib/settings/shortcuts";
import { registerToggleShortcut } from "../../platform/global-shortcut";
import { toast } from "../ui/toast";
import { type Layout, type WallColumns } from "../../lib/settings/layout";
import { exitApp } from "../../platform/app";
import { Tooltip } from "../ui/tooltip";
import { UpdatePanel } from "./UpdatePanel";
import { DeploymentPanel } from "./DeploymentPanel";
import { Button } from "../ui/button";
import {
  MenuCommand,
  MenuContent,
  MenuEmpty,
  MenuGroup,
  MenuInput,
  MenuItem,
  MenuList,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";


type Page = "root" | "layout" | "columns" | "shortcuts" | "updates" | "deployment";

const PAGE_TITLES: Record<Exclude<Page, "root">, string> = {
  layout: "Layout",
  columns: "Wall Columns",
  shortcuts: "Keyboard Shortcuts",
  updates: "Updates",
  deployment: "Deployment",
};

const LAYOUT_OPTIONS: Array<{ id: Layout; label: string; icon: LucideIcon }> = [
  { id: "wall", label: "Wall", icon: LayoutGrid },
  { id: "grouped", label: "Grouped", icon: Layers },
  { id: "stacked", label: "Stacked", icon: LayoutList },
  { id: "ledger", label: "Ledger", icon: AlignJustify },
  { id: "strip", label: "Strip", icon: Rows3 },
  { id: "focus", label: "Focus", icon: Columns2 },
];

const WALL_COLUMN_OPTIONS: Array<{ id: WallColumns; label: string; icon: LucideIcon }> = [
  { id: 1, label: "1 Column", icon: RectangleVertical },
  { id: 2, label: "2 Columns", icon: Columns2 },
  { id: 3, label: "3 Columns", icon: Columns3 },
  { id: 4, label: "4 Columns", icon: Columns4 },
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
  wallColumns: WallColumns;
  onWallColumnsChange: (columns: WallColumns) => void;
  onManageAccounts: () => void;
  onAppearance: () => void;
  dialogOpen: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function SettingsPopover({
  layout,
  onLayoutChange,
  wallColumns,
  onWallColumnsChange,
  onManageAccounts,
  onAppearance,
  dialogOpen,
  onOpenChange,
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

  async function restoreDefaultShortcuts() {
    setRecordingShortcut(false);
    setRecordingRefreshShortcut(false);
    try {
      const ok = await registerToggleShortcut(toGlobalShortcut(DEFAULT_TOGGLE_SHORTCUT));
      if (!ok) {
        toast.error("Couldn't restore the show/hide shortcut — it is already in use.");
        return;
      }
      await setToggleShortcut(DEFAULT_TOGGLE_SHORTCUT);
      setShortcut(DEFAULT_TOGGLE_SHORTCUT);
      await setRefreshShortcut(DEFAULT_REFRESH_SHORTCUT);
      queryClient.setQueryData(REFRESH_SHORTCUT_QUERY_KEY, DEFAULT_REFRESH_SHORTCUT);
      toast.success("Shortcuts restored to defaults");
    } catch (error) {
      toast.error(`Failed to restore defaults: ${error}`);
    }
  }

  const currentLayoutLabel = LAYOUT_OPTIONS.find((o) => o.id === layout)?.label ?? "Wall";
  const goBack = () => setPage(page === "columns" ? "layout" : "root");

  return (
    <MenuRoot
      open={open}
      onOpenChange={(next) => {
        if (!next && recordingAny) return;
        setOpen(next);
      }}
    >
      <Tooltip label="Settings" shortcut={["⌘", "K"]} disabled={open}>
        <span className="inline-flex">
          <MenuTrigger asChild>
            <Button ref={triggerRef} iconOnly variant="glass" size="large" aria-label="Settings">
              <Settings className="size-4" />
            </Button>
          </MenuTrigger>
        </span>
      </Tooltip>
      <MenuContent
        ref={contentRef}
        align="end"
        sideOffset={6}
        collisionPadding={8}
        className="z-50 flex max-h-[var(--radix-popover-content-available-height)] w-80 flex-col overflow-hidden rounded-2xl shadow-lg"
        onEscapeKeyDown={(event) => {
          event.stopPropagation();
          if (page !== "root") {
            event.preventDefault();
            goBack();
          }
        }}
      >
        <MenuCommand
          className="flex min-h-0 flex-col"
          onKeyDown={(event: React.KeyboardEvent) => {
            if (event.key === "Backspace" && query === "" && page !== "root") {
              event.preventDefault();
              goBack();
            }
          }}
        >
          {page !== "updates" && page !== "deployment" ? (
            <MenuInput
              placeholder="Search for actions…"
              value={query}
              onValueChange={setQuery}
            />
          ) : null}
          {page !== "root" ? (
            <div className="flex items-center gap-0.5 px-1.5 pb-0.5 pt-1">
              <Button iconOnly variant="transparent" size="small" aria-label="Back" onClick={goBack}>
                <ChevronLeft className="size-3.5" />
              </Button>
              <span className="text-[11px] font-semibold text-ui-secondary">{PAGE_TITLES[page]}</span>
              <span className="ml-auto pr-1 text-[10.5px] text-ui-tertiary">⌫ / Esc</span>
            </div>
          ) : null}
          <MenuList className="h-auto max-h-[320px] min-h-0 overflow-y-auto p-1">
            {page !== "updates" && page !== "deployment" ? (
              <MenuEmpty>No actions found.</MenuEmpty>
            ) : null}
            {page === "root" && (
              <MenuGroup>
                <MenuItem
                  icon={Users}
                  label="Manage Accounts…"
                  onSelect={() => {
                    onManageAccounts();
                    setOpen(false);
                  }}
                />
                <MenuItem
                  icon={LayoutGrid}
                  label="Layout…"
                  accessory={currentLayoutLabel}
                  onSelect={() => setPage("layout")}
                />
                <MenuItem
                  icon={Contrast}
                  label="Appearance…"
                  onSelect={() => {
                    setOpen(false);
                    onAppearance();
                  }}
                />
                <MenuItem
                  icon={Keyboard}
                  label="Keyboard Shortcuts…"
                  onSelect={() => setPage("shortcuts")}
                />
                <MenuItem icon={RefreshCw} label="Updates…" onSelect={() => setPage("updates")} />
                <MenuItem
                  icon={Info}
                  label="Deployment…"
                  onSelect={() => setPage("deployment")}
                />
                <MenuItem
                  icon={Power}
                  label="Quit"
                  onSelect={() => {
                    void exitApp();
                  }}
                />
              </MenuGroup>
            )}
            {page === "layout" && (
              <>
                {LAYOUT_OPTIONS.map(({ id, label, icon }) => (
                  <MenuItem
                    key={id}
                    icon={icon}
                    label={label}
                    chip={id === "wall" ? String(wallColumns) : undefined}
                    accessory={id === layout ? "✓" : undefined}
                    onSelect={() => {
                      onLayoutChange(id);
                      setPage(id === "wall" ? "columns" : "root");
                    }}
                  />
                ))}
                <MenuSeparator />
                <MenuItem
                  icon={Scaling}
                  label="Restore Default Size"
                  onSelect={() => {
                    void restoreDefaultPanelSize();
                    setOpen(false);
                  }}
                />
              </>
            )}
            {page === "columns" &&
              WALL_COLUMN_OPTIONS.map(({ id, label, icon }) => (
                <MenuItem
                  key={id}
                  icon={icon}
                  label={label}
                  accessory={id === wallColumns ? "✓" : undefined}
                  onSelect={() => {
                    onWallColumnsChange(id);
                    setPage("root");
                  }}
                />
              ))}
            {page === "shortcuts" && (
              <>
                <MenuItem
                  icon={Eye}
                  label="Show / Hide Panel"
                  accessory={recordingShortcut ? "Press keys… (Esc)" : formatAccelerator(shortcut)}
                  onSelect={() => {
                    setRecordingRefreshShortcut(false);
                    setRecordingShortcut((prev) => !prev);
                  }}
                />
                <MenuItem
                  icon={RefreshCw}
                  label="Refresh Usage"
                  accessory={
                    recordingRefreshShortcut ? "Press keys… (Esc)" : formatAccelerator(refreshShortcut)
                  }
                  onSelect={() => {
                    setRecordingShortcut(false);
                    setRecordingRefreshShortcut((prev) => !prev);
                  }}
                />
                <MenuSeparator />
                <MenuItem
                  icon={RotateCcw}
                  label="Restore Defaults"
                  onSelect={() => {
                    void restoreDefaultShortcuts();
                    setOpen(false);
                  }}
                />
              </>
            )}
            {page === "updates" && (
              <div>
                <UpdatePanel />
              </div>
            )}
            {page === "deployment" && (
              <div>
                <DeploymentPanel />
              </div>
            )}
          </MenuList>
        </MenuCommand>
      </MenuContent>
    </MenuRoot>
  );
}
