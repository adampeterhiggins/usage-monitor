import { T3_CHAT_THEME } from "./themePalettes";
import {
  decodeThemeColors,
  formatOklchThemeColor,
  mixThemeRgbColors,
  parseThemeColor,
  parseThemeRgbColor,
  readableThemeForeground,
  readableThemeText,
  solveOklchLightness,
  THEME_BLACK_FOREGROUND,
  THEME_LIGHT_FOREGROUND,
  THEME_WHITE_FOREGROUND,
  themeContrastRatio,
  themeHslToRgb,
  themeOklchToRgb,
  themeOklchToThemeColor,
  themeRelativeLuminance,
  themeRgbToHsl,
  themeRgbToOklch,
  themeRgbToThemeColor,
  toCanonicalThemeColor,
  type ThemeOklch,
  type ThemeRgbColor,
} from "./colors";
import {
  type ThemeAppearance,
  type ThemeColorRole,
  type ThemeColors,
  type ThemeDefinition,
  type ThemeVariants,
} from "./types";

/** Older theme files painted cards and settings chrome with `surface`. */
export function inheritUnspecifiedMenu(
  colors: ThemeColors,
  specified: Record<string, unknown>,
): ThemeColors {
  return specified.menu === undefined ? { ...colors, menu: colors.surface } : colors;
}

/**
 * The palette T3 Code wears with no theme installed, captured from the app's
 * stock tokens (index.css) so a draft seeded from the default look paints the
 * pixels the user is already seeing. Alpha-bearing tokens are flattened over
 * their real backdrops (canvas, or the sidebar for its rows) because theme
 * colors are stored as opaque OKLCH tokens.
 */
const T3_CODE_LIGHT_THEME_COLORS: ThemeColors = {
  canvas: "#fcfcfc",
  chrome: "#fcfcfc",
  toolbar: "#fcfcfc",
  toolbarForeground: "#27272a",
  toolbarBorder: "#e4e4e7",
  toolbarControl: "#ffffff",
  toolbarControlForeground: "#27272a",
  toolbarControlHover: "#f4f4f5",
  surface: "#ffffff",
  menu: "#ffffff",
  surfaceRaised: "#fcfcfc",
  surfaceOverlay: "#ffffff",
  text: "#27272a",
  textMuted: "#71717b",
  border: "#e4e4e7",
  input: "#d4d4d8",
  focus: "#1b4ed8",
  accent: "#1b4ed8",
  accentForeground: "#ffffff",
  secondary: "#fafafa",
  secondaryForeground: "#27272a",
  muted: "#fafafa",
  mutedForeground: "#71717b",
  placeholder: "#71717b",
  secondaryLabel: "#71717b",
  iconMuted: "#71717b",
  error: "#fb2c36",
  errorForeground: "#c10007",
  errorSurface: "#fcebec",
  warning: "#fe9a00",
  warningForeground: "#bb4d00",
  warningSurface: "#fcf4e8",
  update: "#1b4ed8",
  updateForeground: "#1b4ed8",
  updateSurface: "#e0e6f7",
  accentSurface: "#f4f4f5",
  accentSurfaceForeground: "#18181b",
  messageSurface: "#f4f4f5",
  messageForeground: "#27272a",
  messageAction: "#1b4ed8",
  messageActionForeground: "#ffffff",
  messageActionHover: "#3160db",
  codeBackground: "#ffffff",
  codeForeground: "#27272a",
  sidebar: "#fafafa",
  sidebarForeground: "#27272a",
  sidebarMutedForeground: "#71717b",
  sidebarControlSurface: "#f4f4f5",
  sidebarRowHover: "#fcfcfc",
  sidebarRowActive: "#ffffff",
  sidebarRowSelected: "#ffffff",
  sidebarBorder: "#e4e4e7",
  terminalBackground: "#fcfcfc",
  terminalForeground: "#27272a",
  terminalCursor: "#26384e",
  terminalSelection: "#d0d6dd",
  terminalScrollbar: "#d6d6d6",
  terminalScrollbarHover: "#bdbdbd",
};

const T3_CODE_DARK_THEME_COLORS: ThemeColors = {
  canvas: "#0a0a0a",
  chrome: "#0a0a0a",
  toolbar: "#0a0a0a",
  toolbarForeground: "#f5f5f5",
  toolbarBorder: "#191919",
  toolbarControl: "#191919",
  toolbarControlForeground: "#f5f5f5",
  toolbarControlHover: "#141414",
  surface: "#111111",
  menu: "#111111",
  surfaceRaised: "#141414",
  surfaceOverlay: "#191919",
  text: "#f5f5f5",
  textMuted: "#818181",
  border: "#191919",
  input: "#1e1e1e",
  focus: "#346bf1",
  accent: "#346bf1",
  accentForeground: "#ffffff",
  secondary: "#141414",
  secondaryForeground: "#f5f5f5",
  muted: "#141414",
  mutedForeground: "#818181",
  placeholder: "#818181",
  secondaryLabel: "#818181",
  iconMuted: "#818181",
  error: "#fb414a",
  errorForeground: "#ff6467",
  errorSurface: "#301214",
  warning: "#fe9a00",
  warningForeground: "#ffb900",
  warningSurface: "#312108",
  update: "#346bf1",
  updateForeground: "#51a2ff",
  updateSurface: "#121b34",
  accentSurface: "#141414",
  accentSurfaceForeground: "#f5f5f5",
  messageSurface: "#141414",
  messageForeground: "#f5f5f5",
  messageAction: "#346bf1",
  messageActionForeground: "#ffffff",
  messageActionHover: "#3061d9",
  codeBackground: "#111111",
  codeForeground: "#f5f5f5",
  sidebar: "#000000",
  sidebarForeground: "#f1f3f7",
  sidebarMutedForeground: "#a3a3a3",
  sidebarControlSurface: "#0a0a0a",
  sidebarRowHover: "#131313",
  sidebarRowActive: "#1a1b1b",
  sidebarRowSelected: "#111111",
  sidebarBorder: "#141414",
  terminalBackground: "#0a0a0a",
  terminalForeground: "#f5f5f5",
  terminalCursor: "#b4cbff",
  terminalSelection: "#343a47",
  terminalScrollbar: "#222222",
  terminalScrollbarHover: "#363636",
};

/**
 * The standard T3 Code look as a theme palette, for seeding a new theme when
 * no theme is installed. Distinct from {@link getDefaultThemeColors}, which
 * carries the flagship T3 Chat palette used to fill roles omitted by theme
 * files.
 */
export function getStandardThemeColors(appearance: ThemeAppearance): ThemeColors {
  if (appearance === "dark") {
    return (standardDarkThemeColors ??= decodeThemeColors(T3_CODE_DARK_THEME_COLORS));
  }
  return (standardLightThemeColors ??= decodeThemeColors(T3_CODE_LIGHT_THEME_COLORS));
}

let standardLightThemeColors: ThemeColors | undefined;
let standardDarkThemeColors: ThemeColors | undefined;
export function canonicalizeThemeDefinition(theme: ThemeDefinition): ThemeDefinition {
  return {
    ...theme,
    colors: decodeThemeColors(theme.colors),
    ...(theme.variants
      ? {
          variants: Object.fromEntries(
            Object.entries(theme.variants).map(([appearance, colors]) => [
              appearance,
              decodeThemeColors(colors),
            ]),
          ) as ThemeVariants,
        }
      : {}),
  };
}
/**
 * The status colors T3 Code shows without a theme, read from the app's own
 * tokens (red-500 / amber-500 families). Generated palettes fall back to
 * these instead of the flagship theme's, so an imported or created theme
 * never inherits a brand tint on destructive buttons and warnings.
 */
const STANDARD_STATUS_COLORS = {
  light: {
    error: "#fb2c36",
    errorForeground: "#c10007",
    warning: "#fe9a00",
    warningForeground: "#bb4d00",
  },
  dark: {
    error: "#fb414a",
    errorForeground: "#ff6467",
    warning: "#fe9a00",
    warningForeground: "#ffb900",
  },
} as const;

/**
 * Status surfaces are the standard color laid over the theme's own canvas
 * (the unthemed app uses 8% in light and 16% in dark), so alerts still sit on
 * the palette while the signal color stays standard.
 */
function standardStatusColors(canvas: ThemeRgbColor): {
  error: string;
  errorForeground: string;
  errorSurface: string;
  warning: string;
  warningForeground: string;
  warningSurface: string;
} {
  // Keyed off the canvas rather than the appearance slot: a dark canvas saved
  // as a light theme still needs the dark pair, or the alert foreground lands
  // on a dark surface unreadable.
  const appearance: ThemeAppearance = themeRelativeLuminance(canvas) < 0.179 ? "dark" : "light";
  const standard = STANDARD_STATUS_COLORS[appearance];
  const surfaceMix = appearance === "dark" ? 0.16 : 0.08;
  const surfaceOf = (value: string) =>
    mixThemeRgbColors(canvas, parseThemeRgbColor(value, canvas), surfaceMix);
  // The standard foregrounds are tuned against the unthemed canvas; on a
  // tinted one they can fall just short, so lightness is nudged until the
  // pair clears 4.5 while the hue stays standard.
  const readableOn = (foreground: string, surface: ThemeRgbColor) =>
    themeOklchToThemeColor(
      solveOklchLightness(
        themeRgbToOklch(parseThemeRgbColor(foreground, canvas)),
        surface,
        // Leave a little headroom for browser color conversion at render time.
        4.6,
        appearance === "dark" ? "lighter" : "darker",
      ),
    );
  const errorSurface = surfaceOf(standard.error);
  const warningSurface = surfaceOf(standard.warning);
  return {
    error: toCanonicalThemeColor(standard.error)!,
    errorForeground: readableOn(standard.errorForeground, errorSurface),
    errorSurface: themeRgbToThemeColor(errorSurface),
    warning: toCanonicalThemeColor(standard.warning)!,
    warningForeground: readableOn(standard.warningForeground, warningSurface),
    warningSurface: themeRgbToThemeColor(warningSurface),
  };
}

/**
 * Derive a full palette from two exact seed colors, in OKLCH. Surfaces climb a
 * perceptually even lightness ramp that carries the accent hue at low chroma,
 * a companion action color is rotated off the accent, and every foreground is
 * contrast-solved against its own surface.
 */
export function createVividThemeColors(
  appearance: ThemeAppearance,
  backgroundValue: string,
  accentValue: string,
): ThemeColors {
  const defaults = getDefaultThemeColors(appearance);
  const canvasRgb = parseThemeRgbColor(
    backgroundValue,
    appearance === "dark" ? { r: 24, g: 15, b: 27 } : { r: 250, g: 245, b: 250 },
  );
  const accentRgb = parseThemeRgbColor(accentValue, { r: 168, g: 67, b: 112 });
  const canvas = themeRgbToOklch(canvasRgb);
  const accent = themeRgbToOklch(accentRgb);
  // The ramp and every contrast search follow the canvas the user actually
  // picked, not the appearance slot, so a dark canvas saved as a light theme
  // still gets light text and raised surfaces. 0.179 is the relative
  // luminance where white and black text have equal contrast headroom.
  const dark = themeRelativeLuminance(canvasRgb) < 0.179;
  const hue = accent.C < 0.02 ? canvas.h : accent.h;
  const tintC = Math.min(0.045, Math.max(0.008, accent.C * 0.22));
  const step = dark ? 1 : -1;

  const surfaceAt = (deltaL: number, chroma = tintC): ThemeOklch => ({
    L: Math.min(0.98, Math.max(0.05, canvas.L + step * deltaL)),
    C: chroma,
    h: hue,
  });
  const themeColor = (color: ThemeOklch) => themeOklchToThemeColor(color);

  // Text carries a whisper of the accent hue instead of falling back to a
  // fixed foreground, and is solved to WCAG AAA against the canvas.
  const textBase: ThemeOklch = {
    L: dark ? 0.95 : 0.2,
    C: Math.min(0.035, accent.C * 0.25),
    h: hue,
  };
  const text = solveOklchLightness(textBase, canvasRgb, 7, dark ? "lighter" : "darker");
  const textRgb = themeOklchToRgb(text);
  const textMutedRgb = standardMutedThemeText(canvasRgb, textRgb);

  // The companion action rotates off the accent so a two-color theme still
  // gets the dual-voice character of the hand-tuned palettes.
  const action: ThemeOklch = {
    L: Math.min(0.85, Math.max(0.35, accent.L + (dark ? 0.06 : -0.02))),
    C: Math.max(accent.C * 0.9, 0.06),
    h: (hue + 50) % 360,
  };
  const actionRgb = themeOklchToRgb(action);
  const actionForeground = readableThemeForeground(actionRgb);
  const accentForeground = readableThemeForeground(accentRgb);

  const sidebar = surfaceAt(0.045, tintC * 1.4);
  const sidebarRgb = themeOklchToRgb(sidebar);
  const surface = surfaceAt(0.015);
  const surfaceRaised = surfaceAt(0.05);
  const surfaceRaisedRgb = themeOklchToRgb(surfaceRaised);
  const surfaceOverlay = surfaceAt(0.075);
  const border = surfaceAt(dark ? 0.16 : 0.12, Math.min(0.07, accent.C * 0.35));
  const input = surfaceAt(dark ? 0.21 : 0.16, Math.min(0.08, accent.C * 0.4));
  const secondary = surfaceAt(dark ? 0.1 : 0.06, Math.min(0.09, accent.C * 0.5));
  const secondaryRgb = themeOklchToRgb(secondary);
  const muted = surfaceAt(dark ? 0.06 : 0.04, Math.min(0.06, accent.C * 0.35));
  const mutedRgb = themeOklchToRgb(muted);
  const accentSurface = surfaceAt(dark ? 0.13 : 0.08, Math.min(0.11, accent.C * 0.55));
  const accentSurfaceRgb = themeOklchToRgb(accentSurface);
  const messageSurface = surfaceAt(dark ? 0.16 : 0.1, Math.min(0.13, accent.C * 0.6));
  const messageSurfaceRgb = themeOklchToRgb(messageSurface);
  const codeBackground = surfaceAt(0.035, tintC * 0.8);
  const updateSurface = surfaceAt(dark ? 0.14 : 0.09, Math.min(0.12, accent.C * 0.55));

  const foregroundOn = (surfaceRgb: ThemeRgbColor): string =>
    themeOklchToThemeColor(
      solveOklchLightness(textBase, surfaceRgb, 4.6, dark ? "lighter" : "darker"),
    );
  const mutedForeground = foregroundOn(mutedRgb);
  const placeholder = foregroundOn(surfaceRaisedRgb);

  const actionHover: ThemeOklch = { ...action, L: action.L + (dark ? 0.06 : -0.06) };

  return {
    ...defaults,
    ...standardStatusColors(canvasRgb),
    canvas: themeRgbToThemeColor(canvasRgb),
    // The top bar shares the canvas so the main panel reads as one surface.
    chrome: themeRgbToThemeColor(canvasRgb),
    toolbar: themeRgbToThemeColor(canvasRgb),
    toolbarForeground: themeRgbToThemeColor(textRgb),
    toolbarBorder: themeColor(surfaceAt(dark ? 0.14 : 0.1, Math.min(0.08, accent.C * 0.4))),
    toolbarControl: themeColor(surfaceAt(dark ? 0.09 : 0.05, tintC * 1.3)),
    toolbarControlForeground: themeRgbToThemeColor(textRgb),
    toolbarControlHover: themeColor(surfaceAt(dark ? 0.14 : 0.09, tintC * 1.6)),
    surface: themeColor(surface),
    menu: themeColor(surfaceRaised),
    surfaceRaised: themeColor(surfaceRaised),
    surfaceOverlay: themeColor(surfaceOverlay),
    text: themeRgbToThemeColor(textRgb),
    textMuted: themeRgbToThemeColor(textMutedRgb),
    border: themeColor(border),
    input: themeColor(input),
    focus: themeRgbToThemeColor(accentRgb),
    accent: themeRgbToThemeColor(accentRgb),
    accentForeground: themeRgbToThemeColor(accentForeground),
    secondary: themeColor(secondary),
    secondaryForeground: foregroundOn(secondaryRgb),
    muted: themeColor(muted),
    mutedForeground,
    placeholder,
    secondaryLabel: themeRgbToThemeColor(textMutedRgb),
    iconMuted: themeRgbToThemeColor(textMutedRgb),
    update: themeRgbToThemeColor(accentRgb),
    updateForeground: foregroundOn(themeOklchToRgb(updateSurface)),
    updateSurface: themeColor(updateSurface),
    accentSurface: themeColor(accentSurface),
    accentSurfaceForeground: foregroundOn(accentSurfaceRgb),
    messageSurface: themeColor(messageSurface),
    messageForeground: foregroundOn(messageSurfaceRgb),
    messageAction: themeRgbToThemeColor(actionRgb),
    messageActionForeground: themeRgbToThemeColor(actionForeground),
    messageActionHover: themeColor(actionHover),
    codeBackground: themeColor(codeBackground),
    codeForeground: themeRgbToThemeColor(textRgb),
    sidebar: themeColor(sidebar),
    sidebarForeground: foregroundOn(sidebarRgb),
    sidebarMutedForeground: themeRgbToThemeColor(standardMutedThemeText(sidebarRgb, textRgb)),
    sidebarControlSurface: themeColor(surfaceAt(dark ? 0.1 : 0.07, tintC * 1.5)),
    sidebarRowHover: themeColor(surfaceAt(dark ? 0.08 : 0.06, Math.min(0.08, accent.C * 0.45))),
    sidebarRowActive: themeColor(surfaceAt(dark ? 0.12 : 0.09, Math.min(0.1, accent.C * 0.55))),
    sidebarRowSelected: themeColor(surfaceAt(dark ? 0.14 : 0.1, Math.min(0.11, accent.C * 0.6))),
    sidebarBorder: themeColor(surfaceAt(dark ? 0.17 : 0.12, Math.min(0.08, accent.C * 0.4))),
    terminalBackground: themeRgbToThemeColor(canvasRgb),
    terminalForeground: themeRgbToThemeColor(textRgb),
    terminalCursor: themeRgbToThemeColor(accentRgb),
    terminalSelection: themeColor(surfaceAt(dark ? 0.18 : 0.12, Math.min(0.12, accent.C * 0.55))),
    terminalScrollbar: themeColor(surfaceAt(dark ? 0.22 : 0.16, tintC)),
    terminalScrollbarHover: themeColor(surfaceAt(dark ? 0.3 : 0.22, tintC)),
  };
}
// Match the perceived strength of the stock palettes rather than choosing an
// arbitrary foreground mix. These are the measured contrast ratios of zinc-500
// on the standard light canvas and #818181 on the standard dark canvas.
const STANDARD_LIGHT_MUTED_CONTRAST = 4.705;
const STANDARD_DARK_MUTED_CONTRAST = 5.082;

function standardMutedThemeText(
  background: ThemeRgbColor,
  foreground: ThemeRgbColor,
): ThemeRgbColor {
  const target =
    themeRelativeLuminance(background) < 0.179
      ? STANDARD_DARK_MUTED_CONTRAST
      : STANDARD_LIGHT_MUTED_CONTRAST;
  return readableThemeText(background, foreground, 1, target);
}

function managedThemeBackground(value: string, appearance: ThemeAppearance): ThemeRgbColor {
  const selected = parseThemeRgbColor(
    value,
    appearance === "dark" ? { r: 24, g: 15, b: 27 } : { r: 250, g: 245, b: 250 },
  );
  const hsl = themeRgbToHsl(selected);
  return themeHslToRgb({
    h: hsl.h,
    // A background tint should support the selected mode, not turn the whole
    // app into a high-saturation surface.
    s: Math.min(hsl.s, appearance === "dark" ? 0.3 : 0.2),
    l:
      appearance === "dark"
        ? Math.min(0.13, Math.max(0.07, hsl.l))
        : Math.min(0.985, Math.max(0.94, hsl.l)),
  });
}

function managedThemeAccent(
  value: string,
  appearance: ThemeAppearance,
  background: ThemeRgbColor,
): ThemeRgbColor {
  const selected = parseThemeRgbColor(value, { r: 168, g: 67, b: 112 });
  const hsl = themeRgbToHsl(selected);
  const preferredLightness =
    appearance === "dark"
      ? Math.min(0.72, Math.max(0.42, hsl.l))
      : Math.min(0.58, Math.max(0.35, hsl.l));
  const lightnessRange: readonly [number, number] =
    appearance === "dark" ? [0.42, 0.82] : [0.22, 0.58];
  const saturation = Math.min(hsl.s, 0.82);
  const candidates = Array.from({ length: 61 }, (_, index) => {
    const lightness =
      lightnessRange[0] + ((lightnessRange[1] - lightnessRange[0]) * index) / (61 - 1);
    const color = themeHslToRgb({ h: hsl.h, s: saturation, l: lightness });
    return { color, lightness, contrast: themeContrastRatio(color, background) };
  });
  // Leave a little room for browser color conversion at render time.
  const readableCandidates = candidates.filter((candidate) => candidate.contrast >= 4.7);
  const pool = readableCandidates.length > 0 ? readableCandidates : candidates;

  return pool.reduce((best, candidate) => {
    const distance = Math.abs(candidate.lightness - preferredLightness);
    const bestDistance = Math.abs(best.lightness - preferredLightness);
    return distance < bestDistance ||
      (distance === bestDistance && candidate.contrast > best.contrast)
      ? candidate
      : best;
  }).color;
}

/**
 * Creates the guided palette used by the basic theme editor. The two user
 * colors control the mood, while dependent roles are generated together so
 * text, surfaces, message actions, code, and terminal UI stay coherent.
 */
export function createManagedThemeColors(
  appearance: ThemeAppearance,
  backgroundValue: string,
  accentValue: string,
  options?: {
    /** Use the seeds exactly as given instead of nudging them into the
     * readability envelope. Derived foregrounds still adapt for contrast. */
    exactSeeds?: boolean;
  },
): ThemeColors {
  const defaults = getDefaultThemeColors(appearance);
  const canvas = options?.exactSeeds
    ? parseThemeRgbColor(
        backgroundValue,
        appearance === "dark" ? { r: 24, g: 15, b: 27 } : { r: 250, g: 245, b: 250 },
      )
    : managedThemeBackground(backgroundValue, appearance);
  const accent = options?.exactSeeds
    ? parseThemeRgbColor(accentValue, { r: 168, g: 67, b: 112 })
    : managedThemeAccent(accentValue, appearance, canvas);
  const text = readableThemeForeground(canvas);
  const textMuted = standardMutedThemeText(canvas, text);
  // The top bar is part of the main panel, not a separate chrome layer: it
  // shares the canvas, and its controls sit on the panel's own surfaces.
  const chrome = canvas;
  const sidebar = mixThemeRgbColors(canvas, accent, 0.08);
  const surfaceRaised = mixThemeRgbColors(canvas, text, appearance === "dark" ? 0.12 : 0.035);
  const surfaceOverlay = mixThemeRgbColors(canvas, text, appearance === "dark" ? 0.18 : 0.06);
  const secondary = mixThemeRgbColors(canvas, accent, appearance === "dark" ? 0.2 : 0.08);
  const muted = mixThemeRgbColors(canvas, accent, appearance === "dark" ? 0.13 : 0.06);
  const mutedForeground = readableThemeText(muted, text, 1, 4.6);
  const placeholder = readableThemeText(surfaceRaised, text, 1, 4.6);
  const accentSurface = mixThemeRgbColors(canvas, accent, appearance === "dark" ? 0.3 : 0.14);
  const messageSurface = mixThemeRgbColors(canvas, accent, appearance === "dark" ? 0.36 : 0.18);
  const toolbarControl = mixThemeRgbColors(chrome, accent, appearance === "dark" ? 0.2 : 0.08);
  const toolbarBorder = mixThemeRgbColors(chrome, accent, appearance === "dark" ? 0.35 : 0.14);
  const accentForeground = readableThemeForeground(accent);
  // Code and terminal are large surfaces: they keep the canvas hue instead of
  // drifting toward the foreground grey. Code sits just above the canvas —
  // a whisper of the text tint — and the terminal sits on the canvas itself.
  const codeBackground = mixThemeRgbColors(canvas, text, appearance === "dark" ? 0.06 : 0.025);
  const terminalBackground = canvas;
  const messageActionHover = mixThemeRgbColors(
    accent,
    accentForeground === THEME_LIGHT_FOREGROUND || accentForeground === THEME_WHITE_FOREGROUND
      ? THEME_BLACK_FOREGROUND
      : THEME_WHITE_FOREGROUND,
    0.12,
  );

  // The update family follows the accent instead of inheriting the default
  // palette's brand color, so generated themes carry their own identity in
  // update pills and banners. Error and warning stay semantic defaults.
  const updateSurface = mixThemeRgbColors(canvas, accent, appearance === "dark" ? 0.32 : 0.16);
  const updateForeground = mixThemeRgbColors(
    accent,
    appearance === "dark" ? THEME_WHITE_FOREGROUND : THEME_BLACK_FOREGROUND,
    0.35,
  );

  return {
    ...defaults,
    ...standardStatusColors(canvas),
    update: themeRgbToThemeColor(accent),
    updateForeground: themeRgbToThemeColor(updateForeground),
    updateSurface: themeRgbToThemeColor(updateSurface),
    canvas: themeRgbToThemeColor(canvas),
    chrome: themeRgbToThemeColor(chrome),
    toolbar: themeRgbToThemeColor(chrome),
    toolbarForeground: themeRgbToThemeColor(text),
    toolbarBorder: themeRgbToThemeColor(toolbarBorder),
    toolbarControl: themeRgbToThemeColor(toolbarControl),
    toolbarControlForeground: themeRgbToThemeColor(text),
    toolbarControlHover: themeRgbToThemeColor(accentSurface),
    surface: themeRgbToThemeColor(canvas),
    menu: themeRgbToThemeColor(surfaceRaised),
    surfaceRaised: themeRgbToThemeColor(surfaceRaised),
    surfaceOverlay: themeRgbToThemeColor(surfaceOverlay),
    text: themeRgbToThemeColor(text),
    textMuted: themeRgbToThemeColor(textMuted),
    // Borders blend through the accent before lightening so control chrome
    // carries the theme hue like the hand-tuned palettes (#5c345b, #e0d3e1)
    // instead of flattening to grey.
    border: themeRgbToThemeColor(
      mixThemeRgbColors(
        mixThemeRgbColors(canvas, accent, appearance === "dark" ? 0.22 : 0.1),
        text,
        0.1,
      ),
    ),
    input: themeRgbToThemeColor(
      mixThemeRgbColors(
        mixThemeRgbColors(canvas, accent, appearance === "dark" ? 0.3 : 0.14),
        text,
        appearance === "dark" ? 0.14 : 0.13,
      ),
    ),
    focus: themeRgbToThemeColor(accent),
    accent: themeRgbToThemeColor(accent),
    accentForeground: themeRgbToThemeColor(accentForeground),
    secondary: themeRgbToThemeColor(secondary),
    secondaryForeground: themeRgbToThemeColor(readableThemeForeground(secondary)),
    muted: themeRgbToThemeColor(muted),
    mutedForeground: themeRgbToThemeColor(mutedForeground),
    placeholder: themeRgbToThemeColor(placeholder),
    secondaryLabel: themeRgbToThemeColor(textMuted),
    iconMuted: themeRgbToThemeColor(textMuted),
    accentSurface: themeRgbToThemeColor(accentSurface),
    accentSurfaceForeground: themeRgbToThemeColor(readableThemeForeground(accentSurface)),
    messageSurface: themeRgbToThemeColor(messageSurface),
    messageForeground: themeRgbToThemeColor(readableThemeForeground(messageSurface)),
    messageAction: themeRgbToThemeColor(accent),
    messageActionForeground: themeRgbToThemeColor(accentForeground),
    messageActionHover: themeRgbToThemeColor(messageActionHover),
    codeBackground: themeRgbToThemeColor(codeBackground),
    codeForeground: themeRgbToThemeColor(readableThemeForeground(codeBackground)),
    sidebar: themeRgbToThemeColor(sidebar),
    sidebarForeground: themeRgbToThemeColor(readableThemeForeground(sidebar)),
    sidebarMutedForeground: themeRgbToThemeColor(standardMutedThemeText(sidebar, text)),
    sidebarControlSurface: themeRgbToThemeColor(
      mixThemeRgbColors(sidebar, text, appearance === "dark" ? 0.16 : 0.08),
    ),
    sidebarRowHover: themeRgbToThemeColor(mixThemeRgbColors(sidebar, accent, 0.12)),
    sidebarRowActive: themeRgbToThemeColor(mixThemeRgbColors(sidebar, accent, 0.2)),
    sidebarRowSelected: themeRgbToThemeColor(mixThemeRgbColors(sidebar, accent, 0.24)),
    sidebarBorder: themeRgbToThemeColor(
      mixThemeRgbColors(sidebar, text, appearance === "dark" ? 0.35 : 0.12),
    ),
    terminalBackground: themeRgbToThemeColor(terminalBackground),
    terminalForeground: themeRgbToThemeColor(readableThemeForeground(terminalBackground)),
    terminalCursor: themeRgbToThemeColor(accent),
    terminalSelection: themeRgbToThemeColor(
      mixThemeRgbColors(canvas, accent, appearance === "dark" ? 0.35 : 0.18),
    ),
    terminalScrollbar: themeRgbToThemeColor(
      mixThemeRgbColors(canvas, text, appearance === "dark" ? 0.42 : 0.22),
    ),
    terminalScrollbarHover: themeRgbToThemeColor(
      mixThemeRgbColors(canvas, text, appearance === "dark" ? 0.55 : 0.32),
    ),
  };
}

/** Theme-file defaults follow the flagship palette for the requested mode. */
export function getDefaultThemeColors(appearance: ThemeAppearance): ThemeColors {
  return appearance === "dark" ? T3_CHAT_THEME.variants!.dark! : T3_CHAT_THEME.colors;
}

/**
 * Update one Advanced-editor color family without normalizing the rest of an
 * imported or hand-tuned palette. The editor exposes a representative role
 * for each family; paired foregrounds and nearby states are derived only when
 * that representative is changed.
 */
export function updateThemeColorFamily(
  appearance: ThemeAppearance,
  colors: ThemeColors,
  role: ThemeColorRole,
  value: string,
): ThemeColors {
  const parsedSelected = parseThemeColor(value);
  if (!parsedSelected) return { ...colors, [role]: value };
  const normalized = formatOklchThemeColor(parsedSelected.color, parsedSelected.alpha);

  const canvas = parseThemeRgbColor(
    colors.canvas,
    appearance === "dark" ? { r: 24, g: 15, b: 27 } : { r: 250, g: 245, b: 250 },
  );
  const selected = themeOklchToRgb(parsedSelected.color);
  const selectedOn = (background: ThemeRgbColor) =>
    mixThemeRgbColors(background, selected, parsedSelected.alpha);
  const selectedOnCanvas = selectedOn(canvas);
  const accent = parseThemeRgbColor(colors.accent, { r: 168, g: 67, b: 112 });
  const canvasIsDark = themeRelativeLuminance(canvas) < 0.179;
  const terminalIsDark = themeRelativeLuminance(selectedOnCanvas) < 0.179;
  const colorOf = (color: ThemeRgbColor) => themeRgbToThemeColor(color);
  const foregroundOn = (background: ThemeRgbColor) => colorOf(readableThemeForeground(background));
  const selectedToneOn = (background: ThemeRgbColor) =>
    themeOklchToThemeColor(
      solveOklchLightness(
        parsedSelected.color,
        background,
        4.6,
        themeRelativeLuminance(background) < 0.179 ? "lighter" : "darker",
      ),
    );
  const statusColors = () => {
    const surface = mixThemeRgbColors(canvas, selectedOnCanvas, canvasIsDark ? 0.16 : 0.08);
    return {
      foreground: selectedToneOn(surface),
      surface: colorOf(surface),
    };
  };

  switch (role) {
    case "canvas":
      return { ...colors, canvas: normalized, chrome: normalized, toolbar: normalized };
    case "surface":
    case "menu":
    case "surfaceRaised":
    case "surfaceOverlay":
    case "input":
    case "sidebarControlSurface":
      return { ...colors, [role]: normalized };
    case "text":
      return {
        ...colors,
        text: normalized,
        toolbarForeground: normalized,
        toolbarControlForeground: normalized,
      };
    case "mutedForeground":
      return {
        ...colors,
        textMuted: normalized,
        mutedForeground: normalized,
        placeholder: normalized,
        secondaryLabel: normalized,
        iconMuted: normalized,
        sidebarMutedForeground: normalized,
      };
    case "border":
      return {
        ...colors,
        border: normalized,
        toolbarBorder: normalized,
        sidebarBorder: normalized,
      };
    case "secondary":
      return {
        ...colors,
        secondary: normalized,
        secondaryForeground: foregroundOn(selectedOnCanvas),
        muted: normalized,
        toolbarControl: normalized,
      };
    case "accentSurface":
      return {
        ...colors,
        accentSurface: normalized,
        accentSurfaceForeground: foregroundOn(selectedOnCanvas),
        toolbarControlHover: normalized,
      };
    case "accent": {
      const updateSurface = mixThemeRgbColors(canvas, selectedOnCanvas, canvasIsDark ? 0.32 : 0.16);
      return {
        ...colors,
        accent: normalized,
        accentForeground: foregroundOn(selectedOnCanvas),
        focus: normalized,
        update: normalized,
        updateForeground: selectedToneOn(updateSurface),
        updateSurface: colorOf(updateSurface),
        terminalCursor: normalized,
      };
    }
    case "messageAction": {
      const actionForeground = readableThemeForeground(selectedOnCanvas);
      const towardOpposite =
        actionForeground === THEME_LIGHT_FOREGROUND || actionForeground === THEME_WHITE_FOREGROUND
          ? THEME_BLACK_FOREGROUND
          : THEME_WHITE_FOREGROUND;
      const actionHover = mixThemeRgbColors(selected, towardOpposite, 0.12);
      return {
        ...colors,
        messageAction: normalized,
        messageActionForeground: colorOf(actionForeground),
        messageActionHover: formatOklchThemeColor(
          themeRgbToOklch(actionHover),
          parsedSelected.alpha,
        ),
      };
    }
    case "messageSurface":
      return {
        ...colors,
        messageSurface: normalized,
        messageForeground: foregroundOn(selectedOnCanvas),
      };
    case "codeBackground":
      return {
        ...colors,
        codeBackground: normalized,
        codeForeground: foregroundOn(selectedOnCanvas),
      };
    case "sidebar":
      return {
        ...colors,
        sidebar: normalized,
        sidebarForeground: foregroundOn(selectedOnCanvas),
      };
    case "sidebarRowSelected": {
      const sidebar = parseThemeRgbColor(colors.sidebar, canvas);
      const selectedOnSidebar = selectedOn(sidebar);
      return {
        ...colors,
        sidebarRowHover: colorOf(mixThemeRgbColors(sidebar, selectedOnSidebar, 0.5)),
        sidebarRowActive: colorOf(mixThemeRgbColors(sidebar, selectedOnSidebar, 0.8)),
        sidebarRowSelected: normalized,
      };
    }
    case "terminalBackground": {
      const terminalForeground = readableThemeForeground(selectedOnCanvas);
      return {
        ...colors,
        terminalBackground: normalized,
        terminalForeground: colorOf(terminalForeground),
        terminalSelection: colorOf(
          mixThemeRgbColors(selectedOnCanvas, accent, terminalIsDark ? 0.35 : 0.18),
        ),
        terminalScrollbar: colorOf(
          mixThemeRgbColors(selectedOnCanvas, terminalForeground, terminalIsDark ? 0.42 : 0.22),
        ),
        terminalScrollbarHover: colorOf(
          mixThemeRgbColors(selectedOnCanvas, terminalForeground, terminalIsDark ? 0.55 : 0.32),
        ),
      };
    }
    case "error": {
      const status = statusColors();
      return {
        ...colors,
        error: normalized,
        errorForeground: status.foreground,
        errorSurface: status.surface,
      };
    }
    case "warning": {
      const status = statusColors();
      return {
        ...colors,
        warning: normalized,
        warningForeground: status.foreground,
        warningSurface: status.surface,
      };
    }
    default:
      return { ...colors, [role]: normalized };
  }
}
