/** Built-in and custom theme lists plus user actions (select, create, edit,
 *  delete, import files). */

import * as React from "react";
import { Paintbrush, Plus, Trash2, Upload } from "lucide-react";
import { parse as parseJsonc } from "jsonc-parser";

import { toast } from "../ui/toast";
import { installAndPersistTheme, removeAndPersistTheme } from "../../lib/settings/index";
import { getThemeColorsForMode, getThemeDefinition } from "../../lib/theme/registry";
import { parseThemeFile } from "../../lib/theme/theme-file";
import {
  BUILT_IN_THEMES,
  type ThemeDefinition,
} from "../../lib/theme/themePalettes";
import type { ThemePreference, ThemePreferenceMode } from "../../lib/theme/types";
import {
  isVsCodeThemeFile,
  pairVsCodeThemes,
  parseVsCodeThemeFile,
  resolveThemeLabelCollisions,
} from "../../lib/theme/vscodeImport";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { useCustomThemes } from "../../state/appearance";
import { Section } from "./Section";
import { useThemeEditorStore } from "./themeEditorStore";

function ThemeSwatches({ theme }: { theme: ThemeDefinition }) {
  const colors = getThemeColorsForMode(theme, theme.appearance) ?? theme.colors;
  return (
    <span className="flex items-center gap-0.5">
      {[colors.canvas, colors.surface, colors.accent, colors.text].map((color, index) => (
        <span
          key={`${theme.id}-${index}`}
          className="size-2.5 rounded-full ring-1 ring-black/10"
          style={{ background: color }}
        />
      ))}
    </span>
  );
}

async function importThemeFiles(files: FileList | null) {
  if (!files?.length) return;
  const imported: ThemeDefinition[] = [];
  for (const file of Array.from(files)) {
    try {
      const text = await file.text();
      if (file.size > 256 * 1024) throw new Error("File too large");
      let value: unknown;
      try {
        value = JSON.parse(text);
      } catch {
        value = parseJsonc(text);
      }
      if (isVsCodeThemeFile(value)) {
        imported.push(parseVsCodeThemeFile(value));
      } else {
        imported.push(parseThemeFile(value));
      }
    } catch (error) {
      toast.error(`Couldn’t import ${file.name}`, {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const paired = resolveThemeLabelCollisions(
    pairVsCodeThemes(imported).map((theme) => ({ theme })),
  );
  for (const theme of paired) {
    await installAndPersistTheme(theme);
  }
  if (paired.length > 0) {
    toast.success("Themes imported", { description: `${paired.length} theme(s)` });
  }
}

export function ThemeLibrary({
  theme,
  mode,
  onSelectTheme,
}: {
  theme: ThemePreference;
  mode: ThemePreferenceMode;
  onSelectTheme: (next: ThemePreference) => void;
}) {
  const customThemes = useCustomThemes();
  const openCreate = useThemeEditorStore((s) => s.openCreate);
  const openEdit = useThemeEditorStore((s) => s.openEdit);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <>
      <Section title="Built-in">
        <div className="grid gap-1">
          <button
            type="button"
            className={cn(
              "flex items-center justify-between rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-control-subtle",
              !getThemeDefinition(theme) && "bg-control",
            )}
            onClick={() => {
              const next = mode === "light" || mode === "dark" ? mode : "system";
              onSelectTheme(next);
            }}
          >
            <span className="flex items-center gap-2">
              <span className="flex items-center gap-0.5">
                {["#ffffff", "#fcfcfc", "#138af2", "#000000"].map((color) => (
                  <span
                    key={color}
                    className="size-2.5 rounded-full ring-1 ring-black/10"
                    style={{ background: color }}
                  />
                ))}
              </span>
              Default
            </span>
            {!getThemeDefinition(theme) ? "✓" : null}
          </button>
          {BUILT_IN_THEMES.map((builtIn) => (
            <button
              key={builtIn.id}
              type="button"
              className={cn(
                "flex items-center justify-between rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-control-subtle",
                theme === builtIn.id && "bg-control",
              )}
              onClick={() => onSelectTheme(builtIn.id)}
            >
              <span className="flex items-center gap-2">
                <ThemeSwatches theme={builtIn} />
                {builtIn.label}
              </span>
              {theme === builtIn.id ? "✓" : null}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Custom">
        <div className="mb-2 flex gap-2">
          <Button size="small" variant="transparent" onClick={() => openCreate()}>
            <Plus className="size-3.5" />
            Create
          </Button>
          <Button
            size="small"
            variant="transparent"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-3.5" />
            Import
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.jsonc,application/json"
            multiple
            className="hidden"
            onChange={(event) => {
              void importThemeFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </div>
        {customThemes.length === 0 ? (
          <p className="text-[12px] text-tertiary">No custom themes yet.</p>
        ) : (
          <div className="grid gap-1">
            {customThemes.map((custom) => (
              <div
                key={custom.id}
                className={cn(
                  "flex items-center gap-1 rounded-lg px-2.5 py-1.5 hover:bg-control-subtle",
                  theme === custom.id && "bg-control",
                )}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left text-[13px]"
                  onClick={() => onSelectTheme(custom.id)}
                  onDoubleClick={() => openEdit(custom)}
                >
                  <ThemeSwatches theme={custom} />
                  <span className="truncate">{custom.label}</span>
                </button>
                <Button
                  iconOnly
                  size="small"
                  variant="transparent"
                  aria-label={`Edit ${custom.label}`}
                  onClick={() => openEdit(custom)}
                >
                  <Paintbrush className="size-3.5" />
                </Button>
                <Button
                  iconOnly
                  size="small"
                  variant="transparent"
                  aria-label={`Delete ${custom.label}`}
                  onClick={() => void removeAndPersistTheme(custom.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
