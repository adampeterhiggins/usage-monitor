/** Named appearance configurations: save the current look, restore later. */

import * as React from "react";
import { Save, Trash2 } from "lucide-react";

import { toast } from "../ui/toast";
import {
  appearancePresetMatches,
  type AppearancePreset,
  type AppearanceSettings,
} from "../../lib/theme/appearance";
import type { ThemeHalves } from "../../lib/theme/halves";
import type { ThemePreference, ThemePreferenceMode } from "../../lib/theme/types";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Section } from "./Section";

export function AppearancePresets({
  presets,
  current,
  onSave,
  onApply,
  onDelete,
}: {
  presets: AppearancePreset[];
  current: {
    settings: AppearanceSettings;
    theme: ThemePreference;
    mode: ThemePreferenceMode;
    halves: ThemeHalves | null;
  };
  onSave: (name: string) => Promise<AppearancePreset>;
  onApply: (preset: AppearancePreset) => Promise<void>;
  onDelete: (preset: AppearancePreset) => Promise<void>;
}) {
  const [presetName, setPresetName] = React.useState("");

  async function handleSave() {
    const name = presetName.trim();
    if (!name) {
      toast.error("Name required", { description: "Give this configuration a name." });
      return;
    }
    try {
      const saved = await onSave(name);
      setPresetName("");
      toast.success("Configuration saved", { description: saved.name });
    } catch (error) {
      toast.error("Couldn’t save configuration", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function handleApply(preset: AppearancePreset) {
    try {
      await onApply(preset);
    } catch (error) {
      toast.error("Couldn’t apply configuration", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function handleDelete(preset: AppearancePreset) {
    try {
      await onDelete(preset);
    } catch (error) {
      toast.error("Couldn’t delete configuration", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <Section title="Configurations">
      <p className="text-[12px] text-tertiary">
        Save the current theme, mode, and control settings, then click a name to restore
        it later.
      </p>
      <div className="flex gap-1.5">
        <input
          className="h-8 min-w-0 flex-1 rounded-lg border border-separator bg-transparent px-2 text-[13px] outline-none"
          placeholder="Configuration name…"
          value={presetName}
          onChange={(event) => setPresetName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void handleSave();
            }
          }}
        />
        <Button size="small" variant="filled" onClick={() => void handleSave()}>
          <Save className="size-3.5" />
          Save configuration
        </Button>
      </div>
      {presets.length === 0 ? (
        <p className="text-[12px] text-tertiary">No saved configurations yet.</p>
      ) : (
        <div className="grid gap-1">
          {presets.map((preset) => {
            const active = appearancePresetMatches(preset, {
              settings: current.settings,
              theme: current.theme,
              mode: current.mode,
            });
            return (
              <div
                key={preset.id}
                className={cn(
                  "flex items-center gap-1 rounded-lg px-2.5 py-1.5 hover:bg-control-subtle",
                  active && "bg-control",
                )}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left text-[13px]"
                  onClick={() => void handleApply(preset)}
                >
                  {preset.name}
                  {active ? (
                    <span className="ml-1.5 text-[11px] text-tertiary">active</span>
                  ) : null}
                </button>
                <Button
                  iconOnly
                  size="small"
                  variant="transparent"
                  aria-label={`Delete ${preset.name}`}
                  onClick={() => void handleDelete(preset)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}
