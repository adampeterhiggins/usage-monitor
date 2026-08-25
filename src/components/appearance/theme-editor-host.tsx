import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import {
  applyThemeColorPreview,
  createVividThemeColors,
  getThemeColorsForMode,
  getThemeDefinition,
  parseThemeFile,
  THEME_FILE_VERSION,
  themeColorToHex,
  type ThemeAppearance,
  type ThemeColors,
  type ThemeDefinition,
} from "../../lib/theme/palette";
import { installAndPersistTheme, refreshAppliedAppearanceAndBroadcast } from "../../lib/settings";
import { toast } from "../../lib/toast";
import { Button, cn } from "../ui";
import { useThemeEditorStore } from "./theme-editor-store";

function ThemeWireframe({ colors }: { colors: ThemeColors }) {
  return (
    <div
      className="overflow-hidden rounded-xl border border-separator"
      style={{ background: colors.canvas, color: colors.text }}
    >
      <div
        className="flex items-center justify-between px-3 py-2 text-[11px]"
        style={{ background: colors.toolbar, borderBottom: `1px solid ${colors.toolbarBorder}` }}
      >
        <span style={{ color: colors.toolbarForeground }}>Usage Monitor</span>
        <span
          className="rounded-md px-2 py-0.5"
          style={{ background: colors.toolbarControl, color: colors.toolbarControlForeground }}
        >
          Settings
        </span>
      </div>
      <div className="grid gap-2 p-3">
        {["Claude", "Cursor", "Codex"].map((label) => (
          <div
            key={label}
            className="rounded-lg px-3 py-2"
            style={{ background: colors.surface, border: `1px solid ${colors.border}` }}
          >
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span style={{ color: colors.text }}>{label}</span>
              <span style={{ color: colors.textMuted }}>62%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full" style={{ background: colors.muted }}>
              <div
                className="h-full w-[62%] rounded-full"
                style={{ background: colors.accent }}
              />
            </div>
          </div>
        ))}
        <div
          className="rounded-lg px-3 py-2 text-[11px]"
          style={{ background: colors.messageSurface, color: colors.messageForeground }}
        >
          Session remaining looks healthy.
        </div>
      </div>
    </div>
  );
}

export function ThemeEditorHost() {
  const session = useThemeEditorStore((s) => s.session);
  const closeThemeEditor = useThemeEditorStore((s) => s.closeThemeEditor);

  const editingTheme = session?.editingThemeId
    ? getThemeDefinition(session.editingThemeId)
    : null;
  const seedTheme = session?.seedThemeId ? getThemeDefinition(session.seedThemeId) : null;

  const initialAppearance = session?.preferredAppearance ?? "light";
  const seedColors =
    (seedTheme && getThemeColorsForMode(seedTheme, initialAppearance)) ??
    createVividThemeColors(initialAppearance, initialAppearance === "dark" ? "#1c1c1e" : "#ffffff", "#138af2");

  const [name, setName] = React.useState(editingTheme?.label ?? "Custom theme");
  const [appearance, setAppearance] = React.useState<ThemeAppearance>(initialAppearance);
  const [canvas, setCanvas] = React.useState(
    themeColorToHex(seedColors.canvas) ?? (initialAppearance === "dark" ? "#1c1c1e" : "#ffffff"),
  );
  const [accent, setAccent] = React.useState(themeColorToHex(seedColors.accent) ?? "#138af2");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!session) return;
    const nextAppearance = session.preferredAppearance;
    const nextSeed = session.seedThemeId ? getThemeDefinition(session.seedThemeId) : null;
    const nextEditing = session.editingThemeId
      ? getThemeDefinition(session.editingThemeId)
      : null;
    const colors =
      (nextSeed && getThemeColorsForMode(nextSeed, nextAppearance)) ??
      createVividThemeColors(
        nextAppearance,
        nextAppearance === "dark" ? "#1c1c1e" : "#ffffff",
        "#138af2",
      );
    setName(nextEditing?.label ?? "Custom theme");
    setAppearance(nextAppearance);
    setCanvas(themeColorToHex(colors.canvas) ?? "#ffffff");
    setAccent(themeColorToHex(colors.accent) ?? "#138af2");
  }, [session]);

  const draftColors = React.useMemo(
    () => createVividThemeColors(appearance, canvas, accent),
    [appearance, canvas, accent],
  );

  React.useEffect(() => {
    if (!session) return;
    applyThemeColorPreview(draftColors, appearance);
    return () => {
      void refreshAppliedAppearanceAndBroadcast();
    };
  }, [session, draftColors, appearance]);

  async function handleSave() {
    setSaving(true);
    try {
      const theme = parseThemeFile({
        version: THEME_FILE_VERSION,
        ...(editingTheme ? { id: editingTheme.id } : {}),
        name,
        appearance,
        colors: draftColors,
        managed: true,
      });
      // Preserve the opposite variant when editing a dual-mode theme.
      let toSave: ThemeDefinition = theme;
      if (editingTheme?.variants) {
        const other = appearance === "light" ? "dark" : "light";
        const otherColors = editingTheme.variants[other];
        if (otherColors) {
          toSave = parseThemeFile({
            version: THEME_FILE_VERSION,
            id: editingTheme.id,
            name,
            appearance: editingTheme.appearance,
            colors:
              editingTheme.appearance === appearance ? draftColors : editingTheme.colors,
            variants: {
              ...editingTheme.variants,
              [appearance]: draftColors,
              ...(otherColors ? { [other]: otherColors } : {}),
            },
            managed: true,
          });
        }
      }
      await installAndPersistTheme(toSave);
      toast.success(editingTheme ? "Theme saved" : "Theme created", {
        description: toSave.label,
      });
      closeThemeEditor();
      await refreshAppliedAppearanceAndBroadcast();
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
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/30" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[90] w-[min(420px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface p-4 shadow-xl ring-1 ring-black/10">
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="text-[14px] font-medium">
              {editingTheme ? "Edit theme" : "Create theme"}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button iconOnly variant="transparent" size="small" aria-label="Close">
                <X className="size-4" />
              </Button>
            </Dialog.Close>
          </div>
          <div className="grid gap-3">
            <label className="grid gap-1 text-[12px] text-secondary">
              Name
              <input
                className="h-8 rounded-lg border border-separator bg-transparent px-2 text-[13px] text-ink outline-none"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <div className="flex gap-2">
              {(["light", "dark"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={cn(
                    "h-8 flex-1 rounded-lg text-[12px] ring-1 ring-separator",
                    appearance === mode ? "bg-control" : "bg-transparent",
                  )}
                  onClick={() => setAppearance(mode)}
                >
                  {mode === "light" ? "Light" : "Dark"}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1 text-[12px] text-secondary">
                Canvas
                <input
                  type="color"
                  className="h-9 w-full cursor-pointer rounded-lg border border-separator bg-transparent"
                  value={canvas}
                  onChange={(event) => setCanvas(event.target.value)}
                />
              </label>
              <label className="grid gap-1 text-[12px] text-secondary">
                Accent
                <input
                  type="color"
                  className="h-9 w-full cursor-pointer rounded-lg border border-separator bg-transparent"
                  value={accent}
                  onChange={(event) => setAccent(event.target.value)}
                />
              </label>
            </div>
            <ThemeWireframe colors={draftColors} />
            <div className="flex justify-end gap-2">
              <Button variant="transparent" size="small" onClick={closeThemeEditor}>
                Cancel
              </Button>
              <Button size="small" disabled={saving || name.trim().length === 0} onClick={() => void handleSave()}>
                {saving ? "Saving…" : "Save theme"}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
