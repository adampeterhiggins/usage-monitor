/** In-panel Appearance settings: a Radix dialog in the tray panel with a
 *  sidebar (Themes / Marketplace / Controls), a scrolling detail column,
 *  and a dedicated preview rail. Replaces the standalone Appearance
 *  window — the panel's modal-open bridge keeps it from blur-hiding. */

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Download, Eye, EyeOff, Palette, SlidersHorizontal, X } from "lucide-react";

import { cn } from "../../lib/utils";
import { useAppearanceStore } from "../../state/appearance";
import { Button } from "../ui/button";
import {
  AppearanceControls,
  AppearanceModeControl,
  ThemeHalvesControl,
} from "./AppearanceControls";
import { AppearancePresets } from "./AppearancePresets";
import { IdentityControl } from "./IdentityControl";
import { AppearancePreview } from "./AppearancePreview";
import { ThemeLibrary } from "./ThemeLibrary";
import { ThemeMarketplace } from "./ThemeMarketplace";
import { useThemeEditorStore } from "./themeEditorStore";
import { useThemeMarketplace } from "./useThemeMarketplace";

type AppearanceSection = "themes" | "openvsx" | "controls";

const SECTIONS: ReadonlyArray<{
  id: AppearanceSection;
  label: string;
  icon: typeof Palette;
}> = [
  { id: "themes", label: "Themes", icon: Palette },
  { id: "openvsx", label: "Open VSX", icon: Download },
  { id: "controls", label: "Controls", icon: SlidersHorizontal },
];

export function AppearanceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const appearance = useAppearanceStore();
  const [section, setSection] = React.useState<AppearanceSection>("themes");
  const [previewOpen, setPreviewOpen] = React.useState(true);
  const marketplace = useThemeMarketplace({
    active: open && section === "openvsx",
    preferredAppearance: appearance.mode === "dark" ? "dark" : "light",
    onInstalled: () => setSection("themes"),
  });

  React.useEffect(() => {
    if (open) void useAppearanceStore.getState().hydrate();
  }, [open]);

  // Closing with a marketplace preview up restores the persisted appearance.
  // Keyed on `open` only so this runs on close, not every render.
  React.useEffect(() => {
    if (!open && (marketplace.previewingId !== null || marketplace.previewThemeId !== null)) {
      marketplace.dismissPreview();
    }
  }, [open]);

  function selectSection(next: AppearanceSection) {
    if (section === "openvsx" && next !== "openvsx") marketplace.dismissPreview();
    setSection(next);
  }

  const previewCaption = marketplace.previewThemeId
    ? (() => {
        const active = marketplace.previewThemes.find(
          (item) => item.id === marketplace.previewThemeId,
        );
        if (!active) return marketplace.previewExtensionName;
        return marketplace.previewExtensionName
          ? `${marketplace.previewExtensionName} · ${active.label}`
          : active.label;
      })()
    : null;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && useThemeEditorStore.getState().session) return;
        onOpenChange(nextOpen);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 rounded-[16px] bg-ui-scrim" />
        <Dialog.Content
          data-ui-surface="menu"
          className="ui-surface fixed left-1/2 top-1/2 z-50 flex h-[min(448px,calc(100vh-1.5rem))] w-[min(768px,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl p-5 shadow-xl ring-1 ring-ui-subtle"
        >
          <div className="flex shrink-0 items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-[16px] font-semibold">Appearance</Dialog.Title>
              <Dialog.Description className="mt-1 text-[12px] text-ui-secondary">
                Theme, mode, marketplace, and interface controls. Changes apply instantly.
              </Dialog.Description>
            </div>
            <div className="flex items-center gap-1">
              <Button
                iconOnly
                variant="transparent"
                size="small"
                aria-label={previewOpen ? "Hide preview" : "Show preview"}
                className="max-[700px]:hidden"
                onClick={() => setPreviewOpen((current) => !current)}
              >
                {previewOpen ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
              <Dialog.Close asChild>
                <Button iconOnly variant="transparent" size="small" aria-label="Close">
                  <X className="size-4" />
                </Button>
              </Dialog.Close>
            </div>
          </div>

          <div className="mt-4 flex min-h-0 flex-1">
            <nav
              aria-label="Appearance sections"
              className="flex w-[124px] shrink-0 flex-col gap-0.5 border-r border-ui-subtle pr-3"
            >
              {SECTIONS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  aria-current={section === id ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px]",
                    section === id
                      ? "bg-ui-control text-ui-primary"
                      : "text-ui-secondary hover:bg-ui-control-hover",
                  )}
                  onClick={() => selectSection(id)}
                >
                  <Icon className="size-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                </button>
              ))}
            </nav>

            <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4">
              {section === "themes" && (
                <div className="grid gap-4">
                  <AppearanceModeControl
                    theme={appearance.theme}
                    mode={appearance.mode}
                    onModeChange={(next) => void appearance.setMode(next)}
                    onSelectTheme={(next) => void appearance.selectTheme(next)}
                  />
                  <IdentityControl
                    identity={appearance.settings.identity}
                    onSelect={(next) => void appearance.patchSettings({ identity: next })}
                  />
                  <ThemeLibrary
                    theme={appearance.theme}
                    mode={appearance.mode}
                    onSelectTheme={(next) => void appearance.selectTheme(next)}
                  />
                  <ThemeHalvesControl
                    halves={appearance.halves}
                    onChange={(half, themeId) => void appearance.setThemeHalf(half, themeId)}
                  />
                </div>
              )}

              {section === "openvsx" && <ThemeMarketplace marketplace={marketplace} />}

              {section === "controls" && (
                <div className="grid gap-4">
                  <AppearancePresets
                    presets={appearance.presets}
                    current={{
                      settings: appearance.settings,
                      theme: appearance.theme,
                      mode: appearance.mode,
                      halves: appearance.halves,
                    }}
                    onSave={(name) => appearance.savePreset(name)}
                    onApply={(preset) => appearance.applyPreset(preset.id)}
                    onDelete={(preset) => appearance.deletePreset(preset.id)}
                  />
                  <AppearanceControls
                    settings={appearance.settings}
                    onPatch={(patch) => void appearance.patchSettings(patch)}
                  />
                </div>
              )}
            </div>

            <AppearancePreview
              loading={marketplace.previewingId !== null}
              caption={previewCaption}
              className={cn("w-[190px] max-[700px]:hidden", !previewOpen && "hidden")}
            />
          </div>

          <div className="mt-4 flex shrink-0 items-center justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="glass">Done</Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
