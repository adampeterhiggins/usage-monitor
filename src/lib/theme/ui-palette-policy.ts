/** Numeric policy for the UI palette resolver.
 *
 *  Every number the resolver needs lives here so tuning is one file and the
 *  resolver stays mechanism-only. Offsets are OKLCH lightness deltas applied
 *  to a surface's own lightness; the sign is chosen by whether the local
 *  surface reads as dark (positive = lift) or light (negative = deepen). */

import type { ThemeAppearance } from "./themePalettes";

// --- Contrast targets -----------------------------------------------------

/** Minimum contrast for any enabled text/control pair. */
export const CONTRAST_FLOOR = 4.6;
/** Boundary/ring/separation targets. */
export const BOUNDARY_TARGET = 3.1;
/** Nominal text-level targets at 100% contrast. */
export const TEXT_TARGET_PRIMARY = 7.0;
export const TEXT_TARGET_SECONDARY = 5.2;
export const TEXT_TARGET_TERTIARY = 4.6;
/** How much each text level shifts per contrast point (x = contrast-100 / 100). */
export const TEXT_ADJUST_PRIMARY = 3;
export const TEXT_ADJUST_SECONDARY = 1.5;
export const TEXT_ADJUST_TERTIARY = 0.8;

// --- Generated surface offsets (OKLCH L) ----------------------------------

export const OFFSET_CARD = { dark: 0.035, light: 0.012 } as const;
export const OFFSET_MENU = { dark: 0.065, light: 0.02 } as const;
export const OFFSET_CONTROL_REST = 0.045;
export const OFFSET_CONTROL_HOVER = 0.07;
export const OFFSET_CONTROL_PRESSED = 0.09;
export const OFFSET_TRACK = 0.05;
export const OFFSET_INPUT = 0.02;
/** Relative deltas for states derived from an explicit control background. */
export const OFFSET_EXPLICIT_HOVER = 0.025;
export const OFFSET_EXPLICIT_PRESSED = 0.045;
/** Subtle border offset from the local surface. */
export const OFFSET_BORDER_SUBTLE = 0.08;
/** Action/destructive hover/pressed deltas from the rest state. */
export const OFFSET_ACTION_HOVER = 0.035;
export const OFFSET_ACTION_PRESSED = 0.06;
/** Disabled = mix the rest state this far toward the context surface. */
export const DISABLED_MIX = 0.65;

/** Generated surfaces stay neutral: chroma never exceeds this or the canvas's. */
export const NEUTRAL_CHROMA_CAP = 0.025;

// --- Selection ------------------------------------------------------------

export const SELECTION_MIX = { dark: 0.18, light: 0.12 } as const;
export const SELECTION_HOVER_EXTRA_MIX = 0.05;

// --- Soft badges ------------------------------------------------------------

export const SOFT_BADGE_MIX = { dark: 0.14, light: 0.08 } as const;
export const PROVIDER_BADGE_MIX = { dark: 0.16, light: 0.1 } as const;

// --- Material ---------------------------------------------------------------

export const PANEL_OPACITY_START = 0.94;
export const PANEL_OPACITY_STEPS = [0.94, 0.96, 0.98, 1.0] as const;
export const SHADOW_COLOR = "rgb(0 0 0 / 0.12)";
export const SCRIM_COLOR = "rgb(0 0 0 / 0.25)";

// --- Contrast setting -------------------------------------------------------

export function normalizeContrastPreference(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.min(200, Math.max(50, value));
}

export function normalizeGlassOpacity(value: number): number {
  if (!Number.isFinite(value)) return 80;
  return Math.min(100, Math.max(40, value));
}

/** x in [-0.5, +1]; scales generated surface offsets 0.75×–1.5×. */
export function contrastShift(contrast: number): number {
  return (normalizeContrastPreference(contrast) - 100) / 100;
}

export function surfaceScale(contrast: number): number {
  return Math.min(1.5, Math.max(0.75, 1 + 0.5 * contrastShift(contrast)));
}

// --- Semantic status seeds --------------------------------------------------

/** Per-context-appearance status seeds — independent of the theme accent. */
export const STATUS_SEEDS: Record<ThemeAppearance, Record<"healthy" | "warning" | "high" | "critical", string>> = {
  light: {
    healthy: "#006b4f",
    warning: "#f8a300",
    high: "#c75d07",
    critical: "#b12424",
  },
  dark: {
    healthy: "#3dba7a",
    warning: "#e0c04a",
    high: "#f0a15a",
    critical: "#e66767",
  },
};

/** Provider identity tones — deliberately the app's own brand-adjacent set. */
export const PROVIDER_SEEDS: Record<ThemeAppearance, Record<"orange" | "green" | "blue", string>> = {
  light: { orange: "#c75d07", green: "#006b4f", blue: "#138af2" },
  dark: { orange: "#f0a15a", green: "#3dba7a", blue: "#5aa0f0" },
};

// --- Stock seeds ------------------------------------------------------------

/** Stock canvas/accent per mode — the app default look's own values. */
export const STOCK_SEEDS: Record<ThemeAppearance, { canvas: string; accent: string }> = {
  light: { canvas: "#ffffff", accent: "#138af2" },
  dark: { canvas: "#1c1c1e", accent: "#5aa0f0" },
};
