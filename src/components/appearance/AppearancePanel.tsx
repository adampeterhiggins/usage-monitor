import * as React from "react";

import { cn } from "../../lib/utils";
import {
  AppearanceControls,
  AppearanceModeControl,
  ThemeHalvesControl,
} from "./AppearanceControls";
import { AppearancePresets } from "./AppearancePresets";
import { AppearancePreview } from "./AppearancePreview";
import { useAppearanceStore } from "../../state/appearance";
import { ThemeLibrary } from "./ThemeLibrary";
import { ThemeMarketplace } from "./ThemeMarketplace";
import { useThemeMarketplace } from "./useThemeMarketplace";

type AppearanceTab = "themes" | "openvsx" | "controls";

/** Full-window Appearance settings (not clipped by the tray panel). */
export function AppearancePanel() {
  const appearance = useAppearanceStore();
  const [tab, setTab] = React.useState<AppearanceTab>("themes");
  const marketplace = useThemeMarketplace({
    active: tab === "openvsx",
    preferredAppearance: appearance.mode === "dark" ? "dark" : "light",
    onInstalled: () => setTab("themes"),
  });

  React.useEffect(() => {
    void useAppearanceStore.getState().hydrate();
  }, []);

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
    <div className="flex h-full min-h-0 flex-col bg-menu text-ink">
      <div className="flex gap-1 border-b border-separator px-3 py-2">
        {(
          [
            ["themes", "Themes"],
            ["openvsx", "Open VSX"],
            ["controls", "Controls"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={cn(
              "rounded-lg px-2.5 py-1 text-[12px]",
              tab === id ? "bg-control text-ink" : "text-secondary hover:bg-control-subtle",
            )}
            onClick={() => {
              if (tab === "openvsx" && id !== "openvsx") marketplace.dismissPreview();
              setTab(id);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4">
          {tab === "themes" && (
            <div className="grid gap-4">
              <AppearanceModeControl
                theme={appearance.theme}
                mode={appearance.mode}
                onModeChange={(next) => void appearance.setMode(next)}
                onSelectTheme={(next) => void appearance.selectTheme(next)}
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

          {tab === "openvsx" && <ThemeMarketplace marketplace={marketplace} />}

          {tab === "controls" && (
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
        <AppearancePreview loading={marketplace.previewingId !== null} caption={previewCaption} />
      </div>
    </div>
  );
}
