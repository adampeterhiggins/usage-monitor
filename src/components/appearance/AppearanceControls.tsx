/** Appearance controls: mode, per-appearance theme halves, typography,
 *  contrast, glass opacity, and smoothing. */

import { Monitor, Moon, Sun } from "lucide-react";

import {
  DEFAULT_APPEARANCE_SETTINGS,
  MAX_APPEARANCE_CONTRAST,
  MAX_CODE_FONT_SIZE,
  MAX_GLASS_OPACITY,
  MAX_INTERFACE_FONT_SIZE,
  MIN_APPEARANCE_CONTRAST,
  MIN_CODE_FONT_SIZE,
  MIN_GLASS_OPACITY,
  MIN_INTERFACE_FONT_SIZE,
  type AppearanceSettings,
} from "../../lib/theme/appearance";
import type { ThemeHalves } from "../../lib/theme/halves";
import { getThemeDefinition } from "../../lib/theme/registry";
import { BUILT_IN_THEMES } from "../../lib/theme/themePalettes";
import type { ThemePreference, ThemePreferenceMode } from "../../lib/theme/types";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { useCustomThemes } from "../../state/appearance";
import { FontFamilySelect } from "./FontFamilySelect";
import { Section } from "./Section";

export function AppearanceModeControl({
  theme,
  mode,
  onModeChange,
  onSelectTheme,
}: {
  theme: ThemePreference;
  mode: ThemePreferenceMode;
  onModeChange: (next: ThemePreferenceMode) => void;
  onSelectTheme: (next: ThemePreference) => void;
}) {
  return (
    <Section title="Mode">
      <div className="grid grid-cols-3 gap-1">
        {(
          [
            ["system", "Auto", Monitor],
            ["light", "Light", Sun],
            ["dark", "Dark", Moon],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] ring-1 ring-ui-subtle",
              mode === id ||
                (id !== "system" &&
                  theme === id &&
                  mode === "system" &&
                  !getThemeDefinition(theme))
                ? "bg-ui-control"
                : "bg-transparent",
            )}
            onClick={() => {
              onModeChange(id);
              if (id !== "system") onSelectTheme(id);
              else if (theme === "light" || theme === "dark") onSelectTheme("system");
            }}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>
    </Section>
  );
}

export function ThemeHalvesControl({
  halves,
  onChange,
}: {
  halves: ThemeHalves | null;
  onChange: (half: "light" | "dark", themeId: string | "") => void;
}) {
  const customThemes = useCustomThemes();
  const paletteOptions = [...BUILT_IN_THEMES, ...customThemes];
  return (
    <Section title="Auto mix (halves)">
      <p className="text-[12px] text-ui-tertiary">
        When mode is Auto, use different themes for light and dark system appearance.
      </p>
      {(["light", "dark"] as const).map((half) => (
        <label key={half} className="grid gap-1 text-[12px] text-ui-secondary">
          {half === "light" ? "Light half" : "Dark half"}
          <select
            className="h-8 rounded-lg border border-ui-input-border bg-ui-input px-2 text-[13px] text-ui-input-fg"
            value={halves?.[half] ?? ""}
            onChange={(event) => onChange(half, event.target.value)}
          >
            <option value="">Same as selected theme</option>
            {paletteOptions.map((option) => (
              <option key={`${half}-${option.id}`} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ))}
    </Section>
  );
}

export function AppearanceControls({
  settings,
  onPatch,
}: {
  settings: AppearanceSettings;
  onPatch: (patch: Partial<AppearanceSettings>) => void;
}) {
  return (
    <>
      <Section title="Contrast">
        <div className="flex items-center justify-between text-[12px] text-ui-secondary">
          <span>Interface contrast</span>
          <span className="tabular-nums">{settings.appearanceContrast}%</span>
        </div>
        <input
          type="range"
          min={MIN_APPEARANCE_CONTRAST}
          max={MAX_APPEARANCE_CONTRAST}
          value={settings.appearanceContrast}
          onChange={(event) => onPatch({ appearanceContrast: Number(event.target.value) })}
        />
      </Section>
      <Section title="Glass">
        <div className="flex items-center justify-between text-[12px] text-ui-secondary">
          <span>Glass opacity</span>
          <span className="tabular-nums">{settings.glassOpacity}%</span>
        </div>
        <input
          type="range"
          min={MIN_GLASS_OPACITY}
          max={MAX_GLASS_OPACITY}
          value={settings.glassOpacity}
          onChange={(event) => onPatch({ glassOpacity: Number(event.target.value) })}
        />
      </Section>
      <Section title="Interface font">
        <FontFamilySelect
          value={settings.fontFamilySans}
          onValueChange={(fontFamilySans) => onPatch({ fontFamilySans })}
        />
        <div className="flex items-center justify-between text-[12px] text-ui-secondary">
          <span>Size</span>
          <span className="tabular-nums">{settings.fontSizeInterface}px</span>
        </div>
        <input
          type="range"
          min={MIN_INTERFACE_FONT_SIZE}
          max={MAX_INTERFACE_FONT_SIZE}
          value={settings.fontSizeInterface}
          onChange={(event) => onPatch({ fontSizeInterface: Number(event.target.value) })}
        />
      </Section>
      <Section title="Code / mono font">
        <FontFamilySelect
          kind="mono"
          value={settings.fontFamilyCode}
          onValueChange={(fontFamilyCode) => onPatch({ fontFamilyCode })}
        />
        <div className="flex items-center justify-between text-[12px] text-ui-secondary">
          <span>Size</span>
          <span className="tabular-nums">{settings.fontSizeCode}px</span>
        </div>
        <input
          type="range"
          min={MIN_CODE_FONT_SIZE}
          max={MAX_CODE_FONT_SIZE}
          value={settings.fontSizeCode}
          onChange={(event) => onPatch({ fontSizeCode: Number(event.target.value) })}
        />
      </Section>
      <Section title="Smoothing">
        <label className="flex items-center justify-between text-[13px]">
          Antialiased font smoothing
          <input
            type="checkbox"
            checked={settings.fontSmoothing}
            onChange={(event) => onPatch({ fontSmoothing: event.target.checked })}
          />
        </label>
      </Section>
      <Button
        variant="transparent"
        className="justify-center"
        onClick={() => onPatch({ ...DEFAULT_APPEARANCE_SETTINGS })}
      >
        Reset to defaults
      </Button>
    </>
  );
}
