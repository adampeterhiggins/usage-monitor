import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { RotateCcw, X } from "lucide-react";
import { getThemeDefinition } from "../../lib/theme/registry";
import { getThemeSpecForMode, type AppOverrideRole } from "../../lib/theme/source-types";
import {
  installAndPersistTheme,
  updateAndPersistTheme,
} from "../../lib/settings/index";
import {
  themePreview,
  type ThemePreviewSession,
} from "../../lib/theme/controller";
import { resolveUiPalette, type ResolvedUiPalette } from "../../lib/theme/resolve-ui-palette";
import { getLastAppliedAppearanceSettings } from "../../lib/theme/controller";
import type { ThemeAppearance } from "../../lib/theme/types";
import { toast } from "../ui/toast";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { UsageMonitorPreview } from "./AppearancePreview";
import { useThemeEditorStore } from "./themeEditorStore";
import {
  addDraftMode,
  draftModeSpec,
  draftToTheme,
  newThemeDraft,
  resetDraftMode,
  setDraftOverride,
  setDraftSeed,
  themeToDraft,
  type ThemeEditorDraft,
  type ThemeModeDraft,
} from "./theme-draft";

type DraftField = { kind: "seed"; role: "canvas" | "accent" } | { kind: "override"; role: AppOverrideRole };

const COLOR_GROUPS: ReadonlyArray<{
  title: string;
  fields: ReadonlyArray<{ field: DraftField; label: string }>;
}> = [
  {
    title: "Seeds",
    fields: [
      { field: { kind: "seed", role: "canvas" }, label: "Canvas" },
      { field: { kind: "seed", role: "accent" }, label: "Accent" },
    ],
  },
  {
    title: "Backgrounds",
    fields: [
      { field: { kind: "override", role: "cardBackground" }, label: "Cards" },
      { field: { kind: "override", role: "menuBackground" }, label: "Menus" },
      { field: { kind: "override", role: "toolbarBackground" }, label: "Toolbar" },
    ],
  },
  {
    title: "Text",
    fields: [
      { field: { kind: "override", role: "textPrimary" }, label: "Primary" },
      { field: { kind: "override", role: "textSecondary" }, label: "Secondary" },
      { field: { kind: "override", role: "textTertiary" }, label: "Tertiary" },
      { field: { kind: "override", role: "placeholder" }, label: "Placeholder" },
      { field: { kind: "override", role: "toolbarForeground" }, label: "Toolbar" },
    ],
  },
  {
    title: "Primary action",
    fields: [
      { field: { kind: "override", role: "actionBackground" }, label: "Fill" },
      { field: { kind: "override", role: "actionForeground" }, label: "Text" },
      { field: { kind: "override", role: "actionHoverBackground" }, label: "Hover" },
    ],
  },
  {
    title: "Neutral controls",
    fields: [
      { field: { kind: "override", role: "controlBackground" }, label: "Fill" },
      { field: { kind: "override", role: "controlForeground" }, label: "Text" },
      { field: { kind: "override", role: "controlHoverBackground" }, label: "Hover" },
    ],
  },
  {
    title: "Selection",
    fields: [
      { field: { kind: "override", role: "selectionBackground" }, label: "Fill" },
      { field: { kind: "override", role: "selectionForeground" }, label: "Text" },
    ],
  },
  {
    title: "Inputs",
    fields: [
      { field: { kind: "override", role: "inputBackground" }, label: "Fill" },
      { field: { kind: "override", role: "inputForeground" }, label: "Text" },
      { field: { kind: "override", role: "inputPlaceholder" }, label: "Placeholder" },
      { field: { kind: "override", role: "inputBorder" }, label: "Border" },
    ],
  },
  {
    title: "Borders & focus",
    fields: [
      { field: { kind: "override", role: "borderSubtle" }, label: "Subtle" },
      { field: { kind: "override", role: "borderControl" }, label: "Controls" },
      { field: { kind: "override", role: "focusRing" }, label: "Focus ring" },
    ],
  },
  {
    title: "Status",
    fields: [
      { field: { kind: "override", role: "healthy" }, label: "Healthy" },
      { field: { kind: "override", role: "warning" }, label: "Warning" },
      { field: { kind: "override", role: "high" }, label: "High" },
      { field: { kind: "override", role: "critical" }, label: "Error" },
    ],
  },
];

/** Where each editable role's resolved value shows up — fields display the
 *  derived value when no override is set, so every field is visibly live. */
const RESOLVED_FIELD: Record<AppOverrideRole, (p: ResolvedUiPalette) => string> = {
  cardBackground: (p) => p.contexts.card.background,
  menuBackground: (p) => p.contexts.menu.background,
  toolbarBackground: (p) => p.contexts.toolbar.background,
  cardForeground: (p) => p.contexts.card.text.primary,
  menuForeground: (p) => p.contexts.menu.text.primary,
  toolbarForeground: (p) => p.contexts.toolbar.text.primary,
  textPrimary: (p) => p.contexts.canvas.text.primary,
  textSecondary: (p) => p.contexts.canvas.text.secondary,
  textTertiary: (p) => p.contexts.canvas.text.tertiary,
  placeholder: (p) => p.contexts.canvas.text.placeholder,
  controlBackground: (p) => p.contexts.canvas.control.rest.background,
  controlForeground: (p) => p.contexts.canvas.control.rest.foreground,
  controlHoverBackground: (p) => p.contexts.canvas.control.hover.background,
  actionBackground: (p) => p.contexts.canvas.action.rest.background,
  actionForeground: (p) => p.contexts.canvas.action.rest.foreground,
  actionHoverBackground: (p) => p.contexts.canvas.action.hover.background,
  destructiveForeground: (p) => p.contexts.canvas.destructive.rest.foreground,
  selectionBackground: (p) => p.contexts.canvas.selection.rest.background,
  selectionForeground: (p) => p.contexts.canvas.selection.rest.foreground,
  selectionHoverBackground: (p) => p.contexts.canvas.selection.hover.background,
  accentText: (p) => p.contexts.canvas.accentText,
  inputBackground: (p) => p.contexts.canvas.input.background,
  inputForeground: (p) => p.contexts.canvas.input.foreground,
  inputPlaceholder: (p) => p.contexts.canvas.input.placeholder,
  inputBorder: (p) => p.contexts.canvas.input.border,
  borderSubtle: (p) => p.contexts.canvas.borders.subtle,
  borderControl: (p) => p.contexts.canvas.borders.control,
  focusRing: (p) => p.contexts.canvas.borders.focus,
  healthy: (p) => p.contexts.canvas.status.healthy.fill,
  warning: (p) => p.contexts.canvas.status.warning.fill,
  high: (p) => p.contexts.canvas.status.high.fill,
  critical: (p) => p.contexts.canvas.status.critical.fill,
};

function parseHexInput(value: string): string | null {
  const trimmed = value.trim();
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  if (/^#[0-9a-fA-F]{3}$/.test(withHash)) {
    const [, r, g, b] = withHash;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{6}$/.test(withHash)) return withHash.toLowerCase();
  return null;
}

function ColorField({
  label,
  authored,
  resolved,
  onChange,
  onClear,
}: {
  label: string;
  /** The authored value; null when the resolver derives this role. */
  authored: string | null;
  /** The resolved value shown when nothing is authored. */
  resolved: string;
  onChange: (hex: string) => void;
  onClear: () => void;
}) {
  const shown = authored ?? resolved;
  const [text, setText] = React.useState(shown);
  const [focused, setFocused] = React.useState(false);

  React.useEffect(() => {
    if (!focused) setText(shown);
  }, [focused, shown]);

  function commit(next: string) {
    const parsed = parseHexInput(next);
    if (!parsed || parsed === shown) {
      setText(shown);
      return;
    }
    onChange(parsed);
  }

  return (
    <label className="grid min-w-0 gap-1">
      <span className="flex items-center justify-between gap-1 text-[11px] text-ui-secondary">
        <span className="truncate">{label}</span>
        {authored !== null ? (
          <button
            type="button"
            className="shrink-0 text-[9px] uppercase tracking-wide text-ui-tertiary hover:text-ui-primary"
            onClick={(event) => {
              event.preventDefault();
              onClear();
            }}
          >
            auto
          </button>
        ) : null}
      </span>
      <div className="flex min-w-0 items-center gap-1.5">
        <input
          type="color"
          aria-label={label}
          className="h-8 w-8 shrink-0 cursor-pointer rounded-md border border-ui-subtle bg-transparent p-[3px]"
          value={/^#[0-9a-fA-F]{6}$/.test(shown) ? shown : "#000000"}
          onChange={(event) => onChange(event.target.value.toLowerCase())}
        />
        <Input
          spellCheck={false}
          className={cn(
            "min-w-0 flex-1 font-mono text-[12px] uppercase",
            authored === null && "opacity-60",
          )}
          value={text}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            commit(text);
          }}
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            const parsed = parseHexInput(next);
            if (parsed) onChange(parsed);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
        />
      </div>
    </label>
  );
}

export function ThemeEditorHost() {
  const session = useThemeEditorStore((s) => s.session);
  const closeThemeEditor = useThemeEditorStore((s) => s.closeThemeEditor);

  const editingTheme = session?.editingThemeId
    ? getThemeDefinition(session.editingThemeId)
    : null;

  const [draft, setDraft] = React.useState<ThemeEditorDraft | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!session) {
      setDraft(null);
      return;
    }
    if (session.editingThemeId) {
      const theme = getThemeDefinition(session.editingThemeId);
      if (theme) {
        setDraft(themeToDraft(theme));
        return;
      }
    }
    const seed = session.seedThemeId
      ? (getThemeSpecForMode(getThemeDefinition(session.seedThemeId)!, session.preferredAppearance) ??
        getThemeDefinition(session.seedThemeId)!.modes[
          getThemeDefinition(session.seedThemeId)!.appearance
        ] ??
        null)
      : null;
    setDraft(newThemeDraft(seed, session.preferredAppearance));
  }, [session]);

  const activeModeDraft: ThemeModeDraft | null = draft ? (draft.modes[draft.activeMode] ?? null) : null;

  const resolved = React.useMemo(() => {
    if (!draft || !activeModeDraft) return null;
    const settings = getLastAppliedAppearanceSettings();
    return resolveUiPalette(draftModeSpec(activeModeDraft), draft.activeMode, {
      appearanceContrast: settings.appearanceContrast,
      glassOpacity: settings.glassOpacity,
    });
  }, [draft, activeModeDraft]);

  const previewRef = React.useRef<ThemePreviewSession | null>(null);

  // While the editor is open it owns the live preview; opening it supersedes
  // any marketplace preview, and closing restores the persisted appearance —
  // unless a newer owner has already taken over.
  React.useEffect(() => {
    if (!session) return;
    const preview = themePreview.begin();
    previewRef.current = preview;
    return () => {
      previewRef.current = null;
      void preview.end({ restore: true });
    };
  }, [session]);

  React.useEffect(() => {
    if (!session || !draft || !activeModeDraft) return;
    previewRef.current?.show({
      source: draftModeSpec(activeModeDraft),
      appearance: draft.activeMode,
    });
  }, [session, draft, activeModeDraft]);

  function applyField(field: DraftField, hex: string) {
    setDraft((current) => {
      if (!current) return current;
      return field.kind === "seed"
        ? setDraftSeed(current, field.role, hex)
        : setDraftOverride(current, field.role, hex);
    });
  }

  function switchAppearance(next: ThemeAppearance) {
    setDraft((current) => (current ? addDraftMode(current, next) : current));
  }

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    try {
      const theme = draftToTheme(draft, {
        id: editingTheme?.id,
        managed: true,
        collection: editingTheme?.collection,
      });
      if (editingTheme) {
        await updateAndPersistTheme(editingTheme.id, theme);
      } else {
        await installAndPersistTheme(theme);
      }
      toast.success(editingTheme ? "Theme saved" : "Theme created", {
        description: theme.label,
      });
      closeThemeEditor();
      // The session teardown effect restores + repaints the saved theme.
    } catch (error) {
      toast.error("Couldn’t save theme", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog.Root
      open={session !== null}
      onOpenChange={(open) => {
        if (!open) closeThemeEditor();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-ui-scrim" />
        <Dialog.Content
          data-ui-surface="menu"
          className="ui-surface fixed left-1/2 top-1/2 z-[90] flex max-h-[calc(100vh-24px)] w-[min(760px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl p-4 shadow-xl ring-1 ring-ui-subtle"
        >
          <div className="mb-3 flex shrink-0 items-center justify-between">
            <Dialog.Title className="text-[14px] font-medium">
              {editingTheme ? "Edit theme" : "Create theme"}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button iconOnly variant="transparent" size="small" aria-label="Close">
                <X className="size-4" />
              </Button>
            </Dialog.Close>
          </div>
          <div className="grid min-h-0 flex-1 gap-4 overflow-hidden sm:grid-cols-[minmax(0,1fr)_240px]">
            <div className="grid min-h-0 content-start gap-3 overflow-y-auto pr-1">
              <label className="grid gap-1 text-[12px] text-ui-secondary">
                Name
                <Input
                  value={draft?.name ?? ""}
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, name: event.target.value } : current,
                    )
                  }
                />
              </label>
              <div className="flex gap-2">
                {(["light", "dark"] as const).map((mode) => {
                  const has = draft ? draft.modes[mode] !== undefined : false;
                  const active = draft?.activeMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      className={cn(
                        "h-8 flex-1 rounded-lg text-[12px] ring-1 ring-ui-subtle",
                        active ? "bg-ui-control" : "bg-transparent",
                      )}
                      onClick={() => switchAppearance(mode)}
                    >
                      {mode === "light" ? "Light" : "Dark"}
                      {!has ? " · add" : ""}
                    </button>
                  );
                })}
              </div>
              <Button
                variant="transparent"
                size="small"
                className="justify-center"
                onClick={() => setDraft((current) => (current ? resetDraftMode(current) : current))}
              >
                <RotateCcw className="size-3.5" />
                Rebuild from Canvas & Accent
              </Button>
              {COLOR_GROUPS.map((group) => (
                <section key={group.title} className="grid gap-2">
                  <h3 className="text-[11px] font-medium uppercase tracking-wide text-ui-tertiary">
                    {group.title}
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {group.fields.map(({ field, label }) => {
                      const authored =
                        field.kind === "seed"
                          ? (activeModeDraft?.seeds[field.role] ?? null)
                          : (activeModeDraft?.overrides[field.role] ?? null);
                      const resolvedValue = resolved
                        ? field.kind === "seed"
                          ? field.role === "canvas"
                            ? resolved.canvas
                            : resolved.contexts.canvas.action.rest.background
                          : RESOLVED_FIELD[field.role](resolved)
                        : "#000000";
                      return (
                        <ColorField
                          key={`${field.kind}-${field.role}`}
                          label={label}
                          authored={authored}
                          resolved={resolvedValue}
                          onChange={(hex) => applyField(field, hex)}
                          onClear={() => {
                            if (field.kind === "override") {
                              setDraft((current) =>
                                current ? setDraftOverride(current, field.role, null) : current,
                              );
                            }
                          }}
                        />
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
            <div className="flex min-h-0 flex-col gap-2">
              <div className="text-[10px] font-medium uppercase tracking-wide text-ui-tertiary">
                Preview
              </div>
              <UsageMonitorPreview className="min-h-0 flex-1" palette={resolved} />
            </div>
          </div>
          <div className="mt-3 flex shrink-0 justify-end gap-2">
            <Button variant="transparent" size="small" onClick={closeThemeEditor}>
              Cancel
            </Button>
            <Button
              size="small"
              disabled={saving || !draft || draft.name.trim().length === 0}
              onClick={() => void handleSave()}
            >
              {saving ? "Saving…" : "Save theme"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
