import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { RotateCcw, X } from "lucide-react";
import { themeColorToHex } from "../../lib/theme/colors";
import { createVividThemeColors, updateThemeColorFamily } from "../../lib/theme/derive";
import { applyThemeColorPreview } from "../../lib/theme/preview";
import { getThemeColorsForMode, getThemeDefinition } from "../../lib/theme/registry";
import { parseThemeFile } from "../../lib/theme/theme-file";
import {
  THEME_FILE_VERSION,
  type ThemeAppearance,
  type ThemeColorRole,
  type ThemeColors,
  type ThemeDefinition,
} from "../../lib/theme/types";
import { installAndPersistTheme } from "../../lib/settings";
import { refreshAppliedAppearanceAndBroadcast } from "../../lib/theme/controller";
import { toast } from "../../lib/platform/toast";
import { Button, cn, Input } from "../ui";
import { UsageMonitorPreview } from "./appearance-preview";
import { useThemeEditorStore } from "./theme-editor-store";

type ThemeDrafts = Partial<Record<ThemeAppearance, ThemeColors>>;

const COLOR_GROUPS: ReadonlyArray<{
  title: string;
  fields: ReadonlyArray<{ role: ThemeColorRole; label: string }>;
}> = [
  {
    title: "Surfaces",
    fields: [
      { role: "canvas", label: "Canvas" },
      { role: "surface", label: "Cards" },
      { role: "menu", label: "Menus" },
      { role: "surfaceRaised", label: "Raised" },
      { role: "surfaceOverlay", label: "Overlay" },
    ],
  },
  {
    title: "Text",
    fields: [
      { role: "text", label: "Primary" },
      { role: "mutedForeground", label: "Muted" },
    ],
  },
  {
    title: "Chrome",
    fields: [
      { role: "border", label: "Border" },
      { role: "secondary", label: "Controls" },
      { role: "input", label: "Input" },
    ],
  },
  {
    title: "Accent",
    fields: [
      { role: "accent", label: "Accent" },
      { role: "accentSurface", label: "Accent fill" },
      { role: "messageAction", label: "Action" },
    ],
  },
  {
    title: "Status",
    fields: [
      { role: "update", label: "Healthy" },
      { role: "warning", label: "Warning" },
      { role: "error", label: "Error" },
    ],
  },
];

function defaultCanvasHex(appearance: ThemeAppearance): string {
  return appearance === "dark" ? "#1c1c1e" : "#ffffff";
}

function opaqueHex(value: string, fallback = "#000000"): string {
  const hex = themeColorToHex(value) ?? fallback;
  return (hex.slice(0, 7) || fallback).toLowerCase();
}

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

function paletteForMode(
  seedTheme: ThemeDefinition | null,
  appearance: ThemeAppearance,
  accentHex?: string,
): ThemeColors {
  return (
    (seedTheme && getThemeColorsForMode(seedTheme, appearance)) ??
    createVividThemeColors(
      appearance,
      defaultCanvasHex(appearance),
      accentHex ?? "#138af2",
    )
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const hex = opaqueHex(value);
  const [text, setText] = React.useState(hex);
  const [focused, setFocused] = React.useState(false);

  React.useEffect(() => {
    if (!focused) setText(hex);
  }, [focused, hex]);

  function commit(next: string) {
    const parsed = parseHexInput(next);
    if (!parsed || parsed === hex) {
      setText(hex);
      return;
    }
    onChange(parsed);
  }

  return (
    <label className="grid min-w-0 gap-1">
      <span className="text-[11px] text-secondary">{label}</span>
      <div className="flex min-w-0 items-center gap-1.5">
        <input
          type="color"
          aria-label={label}
          className="h-8 w-8 shrink-0 cursor-pointer rounded-md border border-separator bg-transparent p-[3px]"
          value={hex}
          onChange={(event) => onChange(event.target.value.toLowerCase())}
        />
        <Input
          spellCheck={false}
          className="min-w-0 flex-1 font-mono text-[12px] uppercase"
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
  const seedTheme = session?.seedThemeId ? getThemeDefinition(session.seedThemeId) : null;

  const initialAppearance = session?.preferredAppearance ?? "light";
  const [name, setName] = React.useState(editingTheme?.label ?? "Custom theme");
  const [appearance, setAppearance] = React.useState<ThemeAppearance>(initialAppearance);
  const [colors, setColors] = React.useState<ThemeColors>(() =>
    paletteForMode(seedTheme, initialAppearance),
  );
  const [saving, setSaving] = React.useState(false);
  const draftsRef = React.useRef<ThemeDrafts>({});

  React.useEffect(() => {
    if (!session) return;
    const nextAppearance = session.preferredAppearance;
    const nextSeed = session.seedThemeId ? getThemeDefinition(session.seedThemeId) : null;
    const nextEditing = session.editingThemeId
      ? getThemeDefinition(session.editingThemeId)
      : null;
    const nextColors = paletteForMode(nextSeed, nextAppearance);
    const drafts: ThemeDrafts = {};
    const light = nextSeed ? getThemeColorsForMode(nextSeed, "light") : null;
    const dark = nextSeed ? getThemeColorsForMode(nextSeed, "dark") : null;
    if (light) drafts.light = light;
    if (dark) drafts.dark = dark;
    drafts[nextAppearance] = nextColors;
    draftsRef.current = drafts;
    setName(nextEditing?.label ?? "Custom theme");
    setAppearance(nextAppearance);
    setColors(nextColors);
  }, [session]);

  React.useEffect(() => {
    if (!session) return;
    applyThemeColorPreview(colors, appearance);
  }, [session, colors, appearance]);

  React.useEffect(() => {
    if (!session) return;
    return () => {
      void refreshAppliedAppearanceAndBroadcast();
    };
  }, [session]);

  function setFamily(role: ThemeColorRole, hex: string) {
    setColors((current) => updateThemeColorFamily(appearance, current, role, hex));
  }

  function switchAppearance(next: ThemeAppearance) {
    if (next === appearance) return;
    draftsRef.current[appearance] = colors;
    const existing = draftsRef.current[next];
    const generated =
      existing ??
      paletteForMode(seedTheme, next, opaqueHex(colors.accent, "#138af2"));
    draftsRef.current[next] = generated;
    setAppearance(next);
    setColors(generated);
  }

  function rebuildFromSeeds() {
    setColors(
      createVividThemeColors(
        appearance,
        opaqueHex(colors.canvas, defaultCanvasHex(appearance)),
        opaqueHex(colors.accent, "#138af2"),
      ),
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      const drafts = { ...draftsRef.current, [appearance]: colors };
      draftsRef.current = drafts;
      const light = drafts.light ?? (editingTheme ? getThemeColorsForMode(editingTheme, "light") : null);
      const dark = drafts.dark ?? (editingTheme ? getThemeColorsForMode(editingTheme, "dark") : null);
      const hasBoth = Boolean(light && dark);
      const primary = editingTheme?.appearance ?? appearance;
      const primaryColors = (primary === "dark" ? dark : light) ?? colors;

      const theme = parseThemeFile({
        version: THEME_FILE_VERSION,
        ...(editingTheme ? { id: editingTheme.id } : {}),
        name,
        appearance: hasBoth ? primary : appearance,
        colors: hasBoth ? primaryColors : colors,
        ...(hasBoth && light && dark
          ? {
              variants: {
                ...(editingTheme?.variants ?? {}),
                light,
                dark,
              },
            }
          : {}),
        managed: true,
      });
      await installAndPersistTheme(theme);
      toast.success(editingTheme ? "Theme saved" : "Theme created", {
        description: theme.label,
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
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[90] flex max-h-[calc(100vh-24px)] w-[min(760px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-menu p-4 shadow-xl ring-1 ring-black/10">
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
              <label className="grid gap-1 text-[12px] text-secondary">
                Name
                <Input
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
                    onClick={() => switchAppearance(mode)}
                  >
                    {mode === "light" ? "Light" : "Dark"}
                  </button>
                ))}
              </div>
              <Button
                variant="transparent"
                size="small"
                className="justify-center"
                onClick={rebuildFromSeeds}
              >
                <RotateCcw className="size-3.5" />
                Rebuild from Canvas & Accent
              </Button>
              {COLOR_GROUPS.map((group) => (
                <section key={group.title} className="grid gap-2">
                  <h3 className="text-[11px] font-medium uppercase tracking-wide text-tertiary">
                    {group.title}
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {group.fields.map((field) => (
                      <ColorField
                        key={field.role}
                        label={field.label}
                        value={colors[field.role]}
                        onChange={(hex) => setFamily(field.role, hex)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
            <div className="flex min-h-0 flex-col gap-2">
              <div className="text-[10px] font-medium uppercase tracking-wide text-tertiary">
                Preview
              </div>
              <UsageMonitorPreview className="min-h-0 flex-1" colors={colors} />
            </div>
          </div>
          <div className="mt-3 flex shrink-0 justify-end gap-2">
            <Button variant="transparent" size="small" onClick={closeThemeEditor}>
              Cancel
            </Button>
            <Button size="small" disabled={saving || name.trim().length === 0} onClick={() => void handleSave()}>
              {saving ? "Saving…" : "Save theme"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
