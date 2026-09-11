/** Theme editor drafts.
 *
 *  A draft is what the editor edits: per-mode seeds + sparse overrides.
 *  Preview and save both run through the shared resolver — a draft is an
 *  `AppModeSpec`, so what the editor shows is what gets written. */

import {
  createThemeDefinition,
  themeFileIdentity,
  type AppModeSpec,
  type AppOverrideRole,
  type ThemeDefinition,
} from "../../lib/theme/source-types";
import type { ThemeAppearance } from "../../lib/theme/types";

export interface ThemeModeDraft {
  seeds: { canvas: string; accent: string };
  overrides: Partial<Record<AppOverrideRole, string>>;
  panelOpacity?: number;
}

export interface ThemeEditorDraft {
  name: string;
  activeMode: ThemeAppearance;
  modes: Partial<Record<ThemeAppearance, ThemeModeDraft>>;
  origin: { kind: "new" | "edit" | "copy"; themeId?: string };
}

export function appSpecToDraft(spec: AppModeSpec): ThemeModeDraft {
  return {
    seeds: { ...spec.seeds },
    overrides: spec.overrides ? { ...spec.overrides } : {},
    ...(spec.panelOpacity !== undefined ? { panelOpacity: spec.panelOpacity } : {}),
  };
}

export function themeToDraft(theme: ThemeDefinition): ThemeEditorDraft {
  const modes: Partial<Record<ThemeAppearance, ThemeModeDraft>> = {};
  for (const mode of ["light", "dark"] as const) {
    const spec = theme.modes[mode];
    if (spec) modes[mode] = appSpecToDraft(spec);
  }
  return {
    name: theme.label,
    activeMode: theme.appearance,
    modes,
    origin: { kind: "edit", themeId: theme.id },
  };
}

const DEFAULT_SEEDS: Record<ThemeAppearance, { canvas: string; accent: string }> = {
  light: { canvas: "#ffffff", accent: "#138af2" },
  dark: { canvas: "#1c1c1e", accent: "#5aa0f0" },
};

/** A fresh draft seeded from another theme's mode (or the stock look). */
export function newThemeDraft(
  seed: AppModeSpec | null,
  mode: ThemeAppearance,
): ThemeEditorDraft {
  const modeDraft: ThemeModeDraft = seed
    ? appSpecToDraft(seed)
    : { seeds: { ...DEFAULT_SEEDS[mode] }, overrides: {} };
  return {
    name: "Custom theme",
    activeMode: mode,
    modes: { [mode]: modeDraft },
    origin: { kind: seed ? "copy" : "new" },
  };
}

/** The spec a mode draft resolves through — preview and save share it. */
export function draftModeSpec(draft: ThemeModeDraft): AppModeSpec {
  return {
    seeds: draft.seeds,
    ...(Object.keys(draft.overrides).length > 0 ? { overrides: draft.overrides } : {}),
    ...(draft.panelOpacity !== undefined ? { panelOpacity: draft.panelOpacity } : {}),
  };
}

export function draftThemeHasMode(draft: ThemeEditorDraft, mode: ThemeAppearance): boolean {
  return draft.modes[mode] !== undefined;
}

/** Start a mode draft seeded from the other mode's authored values. */
export function addDraftMode(draft: ThemeEditorDraft, mode: ThemeAppearance): ThemeEditorDraft {
  if (draft.modes[mode]) return { ...draft, activeMode: mode };
  const other = mode === "light" ? "dark" : "light";
  const seedFrom = draft.modes[other];
  const seeded: ThemeModeDraft = seedFrom
    ? {
        seeds: { ...seedFrom.seeds },
        overrides: { ...seedFrom.overrides },
        ...(seedFrom.panelOpacity !== undefined
          ? { panelOpacity: seedFrom.panelOpacity }
          : {}),
      }
    : { seeds: { canvas: "#ffffff", accent: "#138af2" }, overrides: {} };
  return {
    ...draft,
    activeMode: mode,
    modes: { ...draft.modes, [mode]: seeded },
  };
}

export function setDraftSeed(
  draft: ThemeEditorDraft,
  seed: "canvas" | "accent",
  value: string,
): ThemeEditorDraft {
  const mode = draft.activeMode;
  const current = draft.modes[mode] ?? { seeds: { canvas: "#ffffff", accent: "#138af2" }, overrides: {} };
  return {
    ...draft,
    modes: {
      ...draft.modes,
      [mode]: { ...current, seeds: { ...current.seeds, [seed]: value } },
    },
  };
}

export function setDraftOverride(
  draft: ThemeEditorDraft,
  role: AppOverrideRole,
  value: string | null,
): ThemeEditorDraft {
  const mode = draft.activeMode;
  const current = draft.modes[mode];
  if (!current) return draft;
  const overrides = { ...current.overrides };
  if (value === null) delete overrides[role];
  else overrides[role] = value;
  return {
    ...draft,
    modes: { ...draft.modes, [mode]: { ...current, overrides } },
  };
}

/** Re-derive a mode's overrides from its seeds — authored overrides are cleared. */
export function resetDraftMode(draft: ThemeEditorDraft): ThemeEditorDraft {
  const mode = draft.activeMode;
  const current = draft.modes[mode];
  if (!current) return draft;
  return {
    ...draft,
    modes: {
      ...draft.modes,
      [mode]: { seeds: current.seeds, overrides: {} },
    },
  };
}

/** The saved definition. The base appearance is the draft's active mode. */
export function draftToTheme(
  draft: ThemeEditorDraft,
  options?: { id?: string; managed?: boolean; collection?: ThemeDefinition["collection"] },
): ThemeDefinition {
  const modes: Partial<Record<ThemeAppearance, AppModeSpec>> = {};
  for (const mode of ["light", "dark"] as const) {
    const modeDraft = draft.modes[mode];
    if (modeDraft) modes[mode] = draftModeSpec(modeDraft);
  }
  const { id } = themeFileIdentity(draft.name, options?.id);
  return createThemeDefinition({
    id,
    label: draft.name.trim() || "Custom theme",
    appearance: draft.modes[draft.activeMode] ? draft.activeMode : "light",
    modes,
    managed: options?.managed ?? true,
    ...(options?.collection ? { collection: options.collection } : {}),
  });
}
