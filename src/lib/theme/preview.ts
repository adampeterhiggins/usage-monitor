/** Paint resolved UI palettes onto the document.
 *
 *  Preview (draft) and installed themes share one mechanism: an `AppModeSpec`
 *  + appearance is resolved into a `ResolvedUiPalette`, serialized into
 *  `--ui-*` variables, and written onto the root element. Production uses the
 *  same path via `applyThemePalette`, so what the editor shows is what gets
 *  saved. */

import { resolveUiPalette, type ResolveUiPaletteOptions } from "./resolve-ui-palette";
import { paletteToCssVariables } from "./ui-palette-css";
import { UI_PALETTE_VARIABLES } from "./ui-tokens";
import { getThemeDefinition, getThemePreferenceMode } from "./registry";
import { type ThemeAppearance, type ThemePreference } from "./types";
import { getThemeSpecForMode, type AppModeSpec } from "./source-types";
import { stockModeSpec } from "./stock-source";

const themePreviewListeners = new Set<() => void>();

export function subscribeToThemePreview(listener: () => void): () => void {
  themePreviewListeners.add(listener);
  return () => themePreviewListeners.delete(listener);
}

function notifyThemePreview(): void {
  for (const listener of themePreviewListeners) listener();
}

/** What a preview session paints: a mode spec plus the mode it renders. */
export interface UiPalettePaint {
  source: AppModeSpec;
  appearance: ThemeAppearance;
}

/** Write a resolved palette onto an element, then mark the appearance. */
export function applyUiPaletteToElement(
  element: HTMLElement,
  palette: ReturnType<typeof resolveUiPalette>,
): void {
  const vars = paletteToCssVariables(palette);
  element.setAttribute("data-ui-stock", String(palette.stock));
  for (const name of UI_PALETTE_VARIABLES) {
    const value = vars[name];
    if (value !== undefined) element.style.setProperty(name, value);
  }
}

/** Remove every `--ui-*` variable (the stylesheet's static fallbacks win). */
export function clearUiPaletteFromElement(element: HTMLElement): void {
  element.removeAttribute("data-ui-stock");
  for (const name of UI_PALETTE_VARIABLES) {
    element.style.removeProperty(name);
  }
}

/**
 * Paint a draft source onto the live app without installing it, so the editor
 * can be judged against the real interface instead of a miniature. Callers
 * restore the stored theme (refreshAppliedAppearance) when the draft goes away.
 */
export function applyUiPalettePreview(
  paint: UiPalettePaint,
  options?: ResolveUiPaletteOptions,
): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!root?.style) return;

  const palette = resolveUiPalette(paint.source, paint.appearance, options);
  applyUiPaletteToElement(root, palette);
  root.setAttribute("data-theme", paint.appearance);
  root.classList.toggle("dark", paint.appearance === "dark");
  notifyThemePreview();
}

/**
 * Paint an installed theme (or the stock look) for the given appearance.
 * `appearance` defaults to the theme's own preferred mode.
 */
export function applyThemePalette(
  theme: ThemePreference,
  appearance?: ThemeAppearance,
  options?: ResolveUiPaletteOptions,
): void {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  if (!root?.style) return;

  const palette = getThemeDefinition(theme);
  const mode = appearance ?? getThemePreferenceMode(theme) ?? "light";
  const spec = palette
    ? (getThemeSpecForMode(palette, mode) ?? palette.modes[palette.appearance])
    : stockModeSpec(mode);
  const specAppearance = palette
    ? getThemeSpecForMode(palette, mode)
      ? mode
      : palette.appearance
    : mode;

  const resolved = resolveUiPalette(spec!, specAppearance, options);
  applyUiPaletteToElement(root, resolved);
}
