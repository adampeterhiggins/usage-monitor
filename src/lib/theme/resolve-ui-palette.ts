/** Resolved UI palette — the single palette every consumer (stock, imported,
 *  custom, preview, production) is computed through.
 *
 *  `resolveUiPalette(spec, appearance, settings)` turns a mode spec into a
 *  complete, ephemeral
 *  palette for one appearance. Authored colors are kept verbatim where they
 *  meet their targets; generated roles are derived from the resolved local
 *  surfaces — never from an unrelated theme's palette. Nothing here touches
 *  the DOM and nothing is persisted. */

import {
  compositeThemeColor,
  mixThemeRgbColors,
  parseThemeColor,
  solveOklchLightness,
  themeColorAlpha,
  themeColorRgb,
  themeContrastRatio,
  themeOklchToRgb,
  themeRelativeLuminance,
  themeRgbToHexColor,
  themeRgbToOklch,
  type ThemeOklch,
  type ThemeRgbColor,
} from "./colors";
import type { ThemeAppearance } from "./themePalettes";
import type { AppModeSpec } from "./source-types";
import { isStockModeSpec } from "./stock-source";
import {
  BOUNDARY_TARGET,
  CONTRAST_FLOOR,
  DISABLED_MIX,
  NEUTRAL_CHROMA_CAP,
  normalizeContrastPreference,
  normalizeGlassOpacity,
  OFFSET_ACTION_HOVER,
  OFFSET_ACTION_PRESSED,
  OFFSET_BORDER_SUBTLE,
  OFFSET_CARD,
  OFFSET_CONTROL_HOVER,
  OFFSET_CONTROL_PRESSED,
  OFFSET_CONTROL_REST,
  OFFSET_EXPLICIT_HOVER,
  OFFSET_EXPLICIT_PRESSED,
  OFFSET_INPUT,
  OFFSET_MENU,
  OFFSET_TRACK,
  PANEL_OPACITY_START,
  PANEL_OPACITY_STEPS,
  PROVIDER_BADGE_MIX,
  PROVIDER_SEEDS,
  SCRIM_COLOR,
  SELECTION_HOVER_EXTRA_MIX,
  SELECTION_MIX,
  SHADOW_COLOR,
  SOFT_BADGE_MIX,
  STATUS_SEEDS,
  STOCK_SEEDS,
  surfaceScale,
  TEXT_ADJUST_PRIMARY,
  TEXT_ADJUST_SECONDARY,
  TEXT_ADJUST_TERTIARY,
  TEXT_TARGET_PRIMARY,
  TEXT_TARGET_SECONDARY,
  TEXT_TARGET_TERTIARY,
  contrastShift,
} from "./ui-palette-policy";
import type { UiProviderTone, UiStatusTone, UiSurfaceContext } from "./ui-tokens";
import { UI_PROVIDER_TONES, UI_SURFACE_CONTEXTS, UI_STATUS_TONES } from "./ui-tokens";

export interface UiPair {
  background: string;
  foreground: string;
}

export interface UiStatefulPair {
  rest: UiPair;
  hover: UiPair;
  pressed: UiPair;
  disabled: UiPair;
}

export interface UiTonePalette {
  fill: string;
  text: string;
  soft: UiPair;
}

export interface UiInputPalette {
  background: string;
  foreground: string;
  placeholder: string;
  border: string;
  focus: string;
}

export interface UiContextPalette {
  background: string;
  text: {
    primary: string;
    secondary: string;
    tertiary: string;
    placeholder: string;
    disabled: string;
  };
  borders: {
    subtle: string;
    control: string;
    focus: string;
  };
  control: UiStatefulPair;
  action: UiStatefulPair;
  destructive: UiStatefulPair;
  selection: { rest: UiPair; hover: UiPair };
  input: UiInputPalette;
  accentText: string;
  track: string;
  status: Record<UiStatusTone, UiTonePalette>;
  providers: Record<UiProviderTone, UiPair>;
}

export interface UiMaterialPalette {
  /** The opaque tint the translucent shell is colored with. */
  panelTint: string;
  /** The alpha the shell applies to `panelTint`. */
  panelOpacity: number;
  glass: UiStatefulPair;
  shadow: string;
  scrim: string;
}

export interface PaletteDiagnostic {
  context: UiSurfaceContext | "material" | "source";
  role: string;
  reason:
    | "composited"
    | "adjusted"
    | "ordered"
    | "target-unreachable"
    | "below-floor"
    | "invalid"
    | "fallback-seed";
  detail: string;
}

export interface ResolvedUiPalette {
  /** App-owned Default only; never accepted from theme-file input. */
  stock: boolean;
  appearance: ThemeAppearance;
  canvas: string;
  contexts: Record<UiSurfaceContext, UiContextPalette>;
  material: UiMaterialPalette;
  diagnostics: ReadonlyArray<PaletteDiagnostic>;
}

export interface ResolveUiPaletteOptions {
  appearanceContrast?: number;
  glassOpacity?: number;
}

// ---------------------------------------------------------------------------
// Small color plumbing

const BLACK: ThemeRgbColor = { r: 0, g: 0, b: 0 };
const WHITE: ThemeRgbColor = { r: 255, g: 255, b: 255 };

function rgb(value: string): ThemeRgbColor | null {
  return themeColorRgb(value);
}

function hexOf(color: ThemeRgbColor): string {
  return themeRgbToHexColor(color);
}

function ratio(foreground: ThemeRgbColor, background: ThemeRgbColor): number {
  return themeContrastRatio(foreground, background);
}

function hexRatio(foreground: string, background: string): number {
  const fg = rgb(foreground);
  const bg = rgb(background);
  return fg && bg ? ratio(fg, bg) : 0;
}

function oklchOf(value: string): ThemeOklch {
  const c = rgb(value) ?? BLACK;
  return themeRgbToOklch(c);
}

function hexAtLightness(base: ThemeOklch, lightness: number): string {
  return hexOf(themeOklchToRgb({ ...base, L: Math.min(1, Math.max(0, lightness)) }));
}

function mixHex(from: string, to: string, amount: number): string {
  const a = rgb(from) ?? BLACK;
  const b = rgb(to) ?? BLACK;
  return hexOf(mixThemeRgbColors(a, b, amount));
}

function isDarkSurface(value: string): boolean {
  const c = rgb(value);
  return c !== null && themeRelativeLuminance(c) < 0.179;
}

/** The pole (pure black or white) with the most contrast on `surface`. */
function strongestPole(surface: string): string {
  return isDarkSurface(surface) ? "#ffffff" : "#000000";
}

/**
 * Shift a surface's OKLCH lightness by `delta`, preserving hue and capping
 * chroma so generated neutrals never pick up accent saturation.
 */
function shiftSurface(surface: string, delta: number): string {
  const base = oklchOf(surface);
  return hexAtLightness(
    { ...base, C: Math.min(base.C, NEUTRAL_CHROMA_CAP) },
    base.L + delta,
  );
}

/** Scale a value's lightness separation from its parent surface. */
function scaleSeparation(value: string, parent: string, scale: number): string {
  const v = oklchOf(value);
  const p = oklchOf(parent);
  return hexAtLightness(v, p.L + (v.L - p.L) * scale);
}

/**
 * Search OKLCH lightness (holding the candidate's hue and chroma) for the
 * closest value that clears `target` against every background. Returns the
 * best endpoint when no lightness can reach the target.
 */
function solveForeground(
  candidate: string | null,
  backgrounds: ReadonlyArray<string>,
  target: number,
): { color: string; ratio: number; reached: boolean } {
  const bgRgbs = backgrounds
    .map((value) => rgb(value))
    .filter((value): value is ThemeRgbColor => value !== null);
  const measure = (value: string) => {
    const fg = rgb(value);
    if (!fg || bgRgbs.length === 0) return 0;
    return Math.min(...bgRgbs.map((bg) => ratio(fg, bg)));
  };

  if (candidate) {
    const candidateRatio = measure(candidate);
    if (candidateRatio >= target) {
      return { color: candidate, ratio: candidateRatio, reached: true };
    }
  }

  const base = candidate ? oklchOf(candidate) : { L: 0.5, C: 0, h: 0 };
  const originL = base.L;
  const steps = 256;
  let best: { l: number; color: string; ratio: number } | null = null;
  for (let index = 0; index <= steps; index += 1) {
    const l = index / steps;
    const color = hexAtLightness(base, l);
    const r = measure(color);
    if (r >= target && (best === null || Math.abs(l - originL) < Math.abs(best.l - originL))) {
      best = { l, color, ratio: r };
    }
  }

  if (best) {
    // Refine locally between the winning sample and its neighbor toward the
    // candidate's original lightness.
    let low = Math.min(best.l, originL);
    let high = Math.max(best.l, originL);
    let refined = best;
    for (let index = 0; index < 10; index += 1) {
      const mid = (low + high) / 2;
      const color = hexAtLightness(base, mid);
      const r = measure(color);
      if (r >= target) {
        refined = { l: mid, color, ratio: r };
        if (mid < originL) low = mid;
        else high = mid;
      } else if (mid < originL) {
        high = mid;
      } else {
        low = mid;
      }
    }
    return { color: refined.color, ratio: refined.ratio, reached: true };
  }

  // Nothing reaches the target — keep the most contrasting endpoint.
  const black = "#000000";
  const white = "#ffffff";
  const blackRatio = measure(black);
  const whiteRatio = measure(white);
  const color = blackRatio >= whiteRatio ? black : white;
  const bestRatio = Math.max(blackRatio, whiteRatio);
  return { color, ratio: bestRatio, reached: bestRatio >= target };
}

/** Reduce a color's contrast against `surface` to at most `cap`. */
function reduceToCap(color: string, surface: string, cap: number): string {
  const fg = rgb(color);
  const bg = rgb(surface);
  if (!fg || !bg) return color;
  if (ratio(fg, bg) <= cap) return color;
  let low = 0;
  let high = 1;
  for (let index = 0; index < 18; index += 1) {
    const mid = (low + high) / 2;
    const mixed = mixThemeRgbColors(bg, fg, mid);
    if (ratio(mixed, bg) > cap) high = mid;
    else low = mid;
  }
  return hexOf(mixThemeRgbColors(bg, fg, low));
}

// ---------------------------------------------------------------------------
// The resolver

type Ctx = UiSurfaceContext;
type Diag = PaletteDiagnostic;

interface ResolveEnv {
  stock: boolean;
  appearance: ThemeAppearance;
  spec: AppModeSpec;
  diagnostics: Diag[];
  scale: number;
  x: number;
  canvas: string;
  accent: string;
  canvasDark: boolean;
}

function maxContrastAgainst(surface: string): number {
  const bg = rgb(surface) ?? BLACK;
  return Math.max(ratio(BLACK, bg), ratio(WHITE, bg));
}

export function resolveUiPalette(
  spec: AppModeSpec,
  appearance: ThemeAppearance,
  options?: ResolveUiPaletteOptions,
): ResolvedUiPalette {
  const diagnostics: Diag[] = [];
  const contrast = normalizeContrastPreference(options?.appearanceContrast ?? 100);
  const glassOpacity = normalizeGlassOpacity(options?.glassOpacity ?? 80);
  const env: ResolveEnv = {
    stock: isStockModeSpec(spec),
    appearance,
    spec,
    diagnostics,
    scale: surfaceScale(contrast),
    x: contrastShift(contrast),
    canvas: "",
    accent: "",
    canvasDark: false,
  };

  const stock = STOCK_SEEDS[appearance];
  env.canvas = resolveSeedColor(env, spec.seeds.canvas, stock.canvas, "canvas");
  env.canvasDark = isDarkSurface(env.canvas);
  env.accent = resolveSeedColor(env, spec.seeds.accent, stock.accent, "accent");

  // Context backgrounds are resolved before everything that depends on them.
  const backgrounds = resolveContextBackgrounds(env);

  const contexts = {} as Record<Ctx, UiContextPalette>;
  for (const context of UI_SURFACE_CONTEXTS) {
    contexts[context] = resolveContext(env, context, backgrounds[context]);
  }

  const material = resolveMaterial(env, contexts, glassOpacity);

  return { stock: env.stock, appearance, canvas: env.canvas, contexts, material, diagnostics };
}

function pushDiag(
  env: ResolveEnv,
  context: Diag["context"],
  role: string,
  reason: Diag["reason"],
  detail: string,
): void {
  env.diagnostics.push({ context, role, reason, detail });
}

/** A seed must parse; alpha composites over the fallback base. */
function resolveSeedColor(
  env: ResolveEnv,
  value: string,
  fallback: string,
  role: string,
): string {
  const parsed = parseThemeColor(value);
  if (!parsed) {
    pushDiag(env, "source", role, "fallback-seed", `"${role}" was not a color; using the stock seed`);
    return fallback;
  }
  if (parsed.alpha < 1) {
    const base = role === "canvas" ? fallback : resolveSeedBase(env);
    const composited = compositeThemeColor(value, base);
    pushDiag(env, "source", role, "composited", `"${role}" had alpha; composited over the base`);
    return composited ?? fallback;
  }
  return compositeThemeColor(value, STOCK_SEEDS[env.appearance].canvas) ?? fallback;
}

function resolveSeedBase(env: ResolveEnv): string {
  return env.canvas || STOCK_SEEDS[env.appearance].canvas;
}

function overrideColor(env: ResolveEnv, role: string): string | undefined {
  const raw = (env.spec.overrides as Record<string, unknown> | undefined)?.[role];
  if (typeof raw !== "string") return undefined;
  const parsed = parseThemeColor(raw);
  if (!parsed) {
    pushDiag(env, "source", role, "invalid", `override "${role}" was not a color; ignored`);
    return undefined;
  }
  return raw;
}

/** Author-supplied color, composited over `base` when it carries alpha. */
function compositeOverride(
  env: ResolveEnv,
  context: Diag["context"],
  role: string,
  base: string,
): string | undefined {
  const raw = overrideColor(env, role);
  if (raw === undefined) return undefined;
  const alpha = themeColorAlpha(raw);
  if (alpha !== null && alpha < 1) {
    pushDiag(env, context, role, "composited", `"${role}" composited over its destination`);
    return compositeThemeColor(raw, base) ?? undefined;
  }
  return compositeThemeColor(raw, base) ?? undefined;
}

function resolveContextBackgrounds(env: ResolveEnv): Record<Ctx, string> {
  const { canvas, canvasDark, scale } = env;

  const cardOverride = compositeOverride(env, "card", "cardBackground", canvas);
  const menuOverride = compositeOverride(env, "menu", "menuBackground", canvas);
  const toolbarOverride = compositeOverride(env, "toolbar", "toolbarBackground", canvas);

  return {
    canvas,
    card:
      cardOverride ??
      shiftSurface(canvas, (canvasDark ? OFFSET_CARD.dark : OFFSET_CARD.light) * scale),
    menu:
      menuOverride ??
      shiftSurface(canvas, (canvasDark ? OFFSET_MENU.dark : OFFSET_MENU.light) * scale),
    // The shell/toolbar keeps the authored surface — the `chrome`/`canvas`
    // split no longer exists; translucency is a material property instead.
    toolbar: toolbarOverride ?? canvas,
  };
}

function resolveContext(env: ResolveEnv, context: Ctx, background: string): UiContextPalette {
  const dark = isDarkSurface(background);
  const dir = dark ? 1 : -1;
  const { scale, spec } = env;
  const overrides = spec.overrides ?? {};

  // -- Neutral control pair --------------------------------------------------
  const explicitControl = compositeOverride(env, context, "controlBackground", background);
  const controlRest = explicitControl
    ? scaleSeparation(explicitControl, background, scale)
    : shiftSurface(background, dir * OFFSET_CONTROL_REST * scale);
  const explicitHover = compositeOverride(env, context, "controlHoverBackground", background);
  let controlHover = explicitHover
    ? hexAtLightness(
        oklchOf(explicitHover),
        oklchOf(controlRest).L + (oklchOf(explicitHover).L - oklchOf(controlRest).L) * scale,
      )
    : explicitControl
      ? shiftSurface(controlRest, dir * OFFSET_EXPLICIT_HOVER * scale)
      : shiftSurface(background, dir * OFFSET_CONTROL_HOVER * scale);
  let controlPressed = explicitControl
    ? shiftSurface(controlRest, dir * OFFSET_EXPLICIT_PRESSED * scale)
    : shiftSurface(background, dir * OFFSET_CONTROL_PRESSED * scale);

  // Keep rest < hover < pressed separation ordered even when authored values
  // are flat or inverted.
  const sep = (value: string) => Math.abs(oklchOf(value).L - oklchOf(background).L);
  if (sep(controlHover) < sep(controlRest) + 0.004) {
    controlHover = shiftSurface(background, dir * (sep(controlRest) + 0.004));
    pushDiag(env, context, "controlHover", "ordered", "hover separation increased past rest");
  }
  if (sep(controlPressed) < sep(controlHover) + 0.008) {
    controlPressed = shiftSurface(background, dir * (sep(controlHover) + 0.008));
    pushDiag(env, context, "controlPressed", "ordered", "pressed separation increased past hover");
  }

  const controlBg = {
    rest: controlRest,
    hover: controlHover,
    pressed: controlPressed,
    disabled: mixHex(controlRest, background, DISABLED_MIX),
  };

  const controlRestForeground = resolveControlForeground(
    env,
    context,
    background,
    overrides.controlForeground,
    controlBg,
  );
  const control: UiStatefulPair = {
    rest: { background: controlBg.rest, foreground: controlRestForeground.rest },
    hover: { background: controlBg.hover, foreground: controlRestForeground.hover },
    pressed: { background: controlBg.pressed, foreground: controlRestForeground.pressed },
    disabled: {
      background: controlBg.disabled,
      foreground: mixHex(controlRestForeground.rest, background, DISABLED_MIX),
    },
  };

  // -- Primary and destructive actions ----------------------------------------
  const actionRestBg =
    compositeOverride(env, context, "actionBackground", background) ?? env.accent;
  const actionHoverOverride = compositeOverride(env, context, "actionHoverBackground", background);
  const action = resolveActionPair(
    env,
    context,
    background,
    "action",
    actionRestBg,
    actionHoverOverride,
  );
  const destructiveSeed =
    compositeOverride(env, context, "critical", background) ??
    STATUS_SEEDS[dark ? "dark" : "light"].critical;
  const destructive = resolveActionPair(
    env,
    context,
    background,
    "destructive",
    destructiveSeed,
    undefined,
  );

  // -- Selection ---------------------------------------------------------------
  const selectionMix = dark ? SELECTION_MIX.dark : SELECTION_MIX.light;
  const selectionRest =
    compositeOverride(env, context, "selectionBackground", background) ??
    mixHex(background, env.accent, selectionMix);
  const selectionHover =
    compositeOverride(env, context, "selectionHoverBackground", background) ??
    mixHex(background, env.accent, selectionMix + SELECTION_HOVER_EXTRA_MIX);

  // -- Text hierarchy ------------------------------------------------------------
  const text = resolveTextLevels(env, context, background);

  // -- Borders ------------------------------------------------------------------
  const subtleOverride = compositeOverride(env, context, "borderSubtle", background);
  const borderSubtle =
    subtleOverride ?? shiftSurface(background, dir * OFFSET_BORDER_SUBTLE * scale);
  const controlBorderOverride = compositeOverride(env, context, "borderControl", background);
  const borderControl = controlBorderOverride
    ? keepAuthored(env, context, "borderControl", controlBorderOverride, background, BOUNDARY_TARGET)
    : solveBorder(env, context, "borderControl", borderSubtle, background);
  const focusOverride = compositeOverride(env, context, "focusRing", background);
  const borderFocus = focusOverride
    ? keepAuthored(env, context, "focusRing", focusOverride, background, BOUNDARY_TARGET)
    : solveBorder(env, context, "focusRing", env.accent, background);

  // -- Input ---------------------------------------------------------------------
  const inputBackground =
    compositeOverride(env, context, "inputBackground", background) ??
    shiftSurface(background, dir * OFFSET_INPUT * scale);
  const inputForeground =
    solveToFloor(
      env,
      context,
      "inputForeground",
      compositeOverride(env, context, "inputForeground", inputBackground),
      inputBackground,
      text.primary,
    );
  const inputPlaceholder = solveToFloor(
    env,
    context,
    "inputPlaceholder",
    compositeOverride(env, context, "inputPlaceholder", inputBackground),
    inputBackground,
    text.placeholder,
  );
  let inputBorder =
    compositeOverride(env, context, "inputBorder", inputBackground) ?? borderControl;
  if (!env.stock) inputBorder = solveBorder(env, context, "inputBorder", inputBorder, background);
  const inputFocus = borderFocus;
  const input: UiInputPalette = {
    background: inputBackground,
    foreground: inputForeground,
    placeholder: inputPlaceholder,
    border: inputBorder,
    focus: inputFocus,
  };

  // -- Selection foregrounds -------------------------------------------------------
  const selectionRestForeground = solveToFloor(
    env,
    context,
    "selectionForeground",
    compositeOverride(env, context, "selectionForeground", selectionRest),
    selectionRest,
    text.primary,
  );
  const selectionHoverForeground = solveForeground(
    selectionRestForeground,
    [selectionHover],
    CONTRAST_FLOOR,
  ).color;
  const selection = {
    rest: { background: selectionRest, foreground: selectionRestForeground },
    hover: { background: selectionHover, foreground: selectionHoverForeground },
  };

  // -- Accent as text -----------------------------------------------------------
  const accentText = compositeOverride(env, context, "accentText", background);
  if (env.stock && accentText && hexRatio(accentText, background) < CONTRAST_FLOOR) {
    pushDiag(
      env,
      context,
      "accentText",
      "below-floor",
      `"accentText" stays authored at ${hexRatio(accentText, background).toFixed(2)}:1, below ${CONTRAST_FLOOR}:1`,
    );
  }
  const accentTextColor = env.stock
    ? accentText ?? solveForeground(env.accent, [background], CONTRAST_FLOOR).color
    : solveToFloor(env, context, "accentText", accentText, background, env.accent);

  const track = shiftSurface(background, dir * (env.stock ? OFFSET_TRACK : 0.03) * scale);

  // -- Status + provider tones -----------------------------------------------------
  const status = {} as Record<UiStatusTone, UiTonePalette>;
  for (const tone of UI_STATUS_TONES) {
    status[tone] = resolveStatusTone(
      env,
      context,
      background,
      dark,
      track,
      tone,
      text,
      borderControl,
    );
  }
  const providers = {} as Record<UiProviderTone, UiPair>;
  for (const tone of UI_PROVIDER_TONES) {
    providers[tone] = resolveProviderTone(background, dark, tone);
  }

  return {
    background,
    text,
    borders: { subtle: borderSubtle, control: borderControl, focus: borderFocus },
    control,
    action,
    destructive,
    selection,
    input,
    accentText: accentTextColor,
    track,
    status,
    providers,
  };
}

/** Foreground pair solved across all control state backgrounds. */
function resolveControlForeground(
  env: ResolveEnv,
  context: Ctx,
  surface: string,
  explicit: string | undefined,
  bgs: { rest: string; hover: string; pressed: string },
): { rest: string; hover: string; pressed: string } {
  const authored = explicit
    ? (compositeThemeColor(explicit, surface) ?? explicit)
    : undefined;
  if (authored && env.stock) {
    const worst = Math.min(
      hexRatio(authored, bgs.rest),
      hexRatio(authored, bgs.hover),
      hexRatio(authored, bgs.pressed),
    );
    if (worst < CONTRAST_FLOOR) {
      pushDiag(
        env,
        context,
        "controlForeground",
        "below-floor",
        `"controlForeground" stays authored at ${worst.toFixed(2)}:1, below ${CONTRAST_FLOOR}:1`,
      );
    }
    return { rest: authored, hover: authored, pressed: authored };
  }
  if (explicit && !env.stock) {
    return {
      rest: solveToFloor(env, context, "controlForeground", compositeThemeColor(explicit, bgs.rest), bgs.rest, strongestPole(bgs.rest)),
      hover: solveToFloor(env, context, "controlForeground", compositeThemeColor(explicit, bgs.hover), bgs.hover, strongestPole(bgs.hover)),
      pressed: solveToFloor(env, context, "controlForeground", compositeThemeColor(explicit, bgs.pressed), bgs.pressed, strongestPole(bgs.pressed)),
    };
  }
  const shared = solveForeground(null, [bgs.rest, bgs.hover, bgs.pressed], CONTRAST_FLOOR);
  if (shared.reached) return { rest: shared.color, hover: shared.color, pressed: shared.color };
  // No single color clears the floor on every state — solve each separately.
  pushDiag(env, context, "controlForeground", "adjusted", "per-state control foregrounds");
  return {
    rest: solveForeground(null, [bgs.rest], CONTRAST_FLOOR).color,
    hover: solveForeground(null, [bgs.hover], CONTRAST_FLOOR).color,
    pressed: solveForeground(null, [bgs.pressed], CONTRAST_FLOOR).color,
  };
}

/**
 * A filled pair with stateful hover/pressed/disabled over `surface`.
 * `restBg` is the resolved (already composited) resting background.
 */
function resolveActionPair(
  env: ResolveEnv,
  context: Ctx,
  surface: string,
  family: "action" | "destructive",
  restBg: string,
  hoverOverride: string | undefined,
): UiStatefulPair {
  const dark = isDarkSurface(surface);
  const restL = oklchOf(restBg).L;
  const surfaceL = oklchOf(surface).L;
  // Hover moves away from the surface: the direction that adds contrast.
  const dir = restL > surfaceL ? 1 : restL < surfaceL ? -1 : dark ? 1 : -1;

  const hoverBg = hoverOverride
    ? hexAtLightness(
        oklchOf(hoverOverride),
        restL + (oklchOf(hoverOverride).L - restL) * env.scale,
      )
    : hexAtLightness(oklchOf(restBg), restL + dir * OFFSET_ACTION_HOVER * env.scale);
  const pressedBg = hexAtLightness(
    oklchOf(restBg),
    restL + dir * OFFSET_ACTION_PRESSED * env.scale,
  );
  const disabledBg = mixHex(restBg, surface, DISABLED_MIX);

  const fgOverride = compositeOverride(env, context, `${family}Foreground`, restBg);
  let fg: { rest: string; hover: string; pressed: string };
  if (fgOverride && env.stock) {
    const worst = Math.min(
      hexRatio(fgOverride, restBg),
      hexRatio(fgOverride, hoverBg),
      hexRatio(fgOverride, pressedBg),
    );
    if (worst < CONTRAST_FLOOR) {
      pushDiag(
        env,
        context,
        `${family}Foreground`,
        "below-floor",
        `"${family}Foreground" stays authored at ${worst.toFixed(2)}:1, below ${CONTRAST_FLOOR}:1`,
      );
    }
    fg = { rest: fgOverride, hover: fgOverride, pressed: fgOverride };
  } else if (fgOverride) {
    const raw = overrideColor(env, `${family}Foreground`)!;
    fg = {
      rest: solveToFloor(env, context, `${family}Foreground`, fgOverride, restBg, strongestPole(restBg)),
      hover: solveToFloor(env, context, `${family}Foreground`, compositeThemeColor(raw, hoverBg), hoverBg, strongestPole(hoverBg)),
      pressed: solveToFloor(env, context, `${family}Foreground`, compositeThemeColor(raw, pressedBg), pressedBg, strongestPole(pressedBg)),
    };
  } else {
    const shared = solveForeground(null, [restBg, hoverBg, pressedBg], CONTRAST_FLOOR);
    fg = { rest: shared.color, hover: shared.color, pressed: shared.color };
    if (!shared.reached) {
      pushDiag(env, context, `${family}Foreground`, "adjusted", "per-state action foregrounds");
      fg = {
        rest: solveForeground(null, [restBg], CONTRAST_FLOOR).color,
        hover: solveForeground(null, [hoverBg], CONTRAST_FLOOR).color,
        pressed: solveForeground(null, [pressedBg], CONTRAST_FLOOR).color,
      };
    }
  }

  return {
    rest: { background: restBg, foreground: fg.rest },
    hover: { background: hoverBg, foreground: fg.hover },
    pressed: { background: pressedBg, foreground: fg.pressed },
    disabled: {
      background: disabledBg,
      foreground: mixHex(fg.rest, disabledBg, 0.55),
    },
  };
}

/** Preserve source intent, repairing only the rendered foreground. Default
 * keeps its existing authored treatment as an explicit product exception. */
function solveToFloor(
  env: ResolveEnv,
  context: Ctx,
  role: string,
  candidate: string | null | undefined,
  surface: string,
  fallback: string,
): string {
  if (candidate && env.stock) {
    const measured = hexRatio(candidate, surface);
    if (measured < CONTRAST_FLOOR) {
      pushDiag(
        env,
        context,
        role,
        "below-floor",
        `"${role}" stays authored at ${measured.toFixed(2)}:1, below ${CONTRAST_FLOOR}:1`,
      );
    }
    return candidate;
  }
  const solved = solveForeground(candidate ?? fallback, [surface], CONTRAST_FLOOR);
  if (candidate && candidate !== solved.color) {
    pushDiag(env, context, role, "adjusted", `${role} adjusted for readable text on its surface`);
  }
  if (!solved.reached) {
    pushDiag(env, context, role, "target-unreachable", `"${role}" cannot reach ${CONTRAST_FLOOR}:1`);
  }
  return solved.color;
}

/** Authored boundary colors stay verbatim; flag the ones below target. */
function keepAuthored(
  env: ResolveEnv,
  context: Ctx,
  role: string,
  color: string,
  surface: string,
  target: number,
): string {
  if (!env.stock) return solveBorder(env, context, role, color, surface);
  const measured = hexRatio(color, surface);
  if (measured < target) {
    pushDiag(
      env,
      context,
      role,
      "below-floor",
      `"${role}" stays authored at ${measured.toFixed(2)}:1, below ${target}:1`,
    );
  }
  return color;
}

/** A derived border/boundary color raised to `BOUNDARY_TARGET` separation. */
function solveBorder(env: ResolveEnv, context: Ctx, role: string, color: string, surface: string): string {
  if (hexRatio(color, surface) >= BOUNDARY_TARGET) return color;
  if (!env.stock) {
    const solved = solveForeground(color, [surface], BOUNDARY_TARGET);
    pushDiag(env, context, role, solved.reached ? "adjusted" : "target-unreachable", `${role} adjusted for visible separation`);
    return solved.color;
  }
  const base = oklchOf(color);
  const bg = rgb(surface) ?? BLACK;
  const direction = isDarkSurface(surface) ? "lighter" : "darker";
  const solved = solveOklchLightness(base, bg, BOUNDARY_TARGET, direction);
  const value = hexOf(themeOklchToRgb(solved));
  if (value !== color) {
    pushDiag(env, context, role, "adjusted", `"${role}" raised to ${BOUNDARY_TARGET}:1 separation`);
  }
  return value;
}

function resolveTextLevels(
  env: ResolveEnv,
  context: Ctx,
  surface: string,
): UiContextPalette["text"] {
  const { overrides } = env.spec;
  const { x } = env;
  const headroom = maxContrastAgainst(surface);
  const ctxForegroundRole =
    context === "card"
      ? "cardForeground"
      : context === "menu"
        ? "menuForeground"
        : context === "toolbar"
          ? "toolbarForeground"
          : undefined;
  const ctxForeground = ctxForegroundRole
    ? compositeOverride(env, context, ctxForegroundRole, surface)
    : undefined;

  const level = (
    supplied: string | undefined,
    nominalTarget: number,
    adjust: number,
    cap: number,
    fallbackFrom: string | null,
  ): { color: string; ratio: number } => {
    const authored = supplied
      ? (compositeThemeColor(supplied, surface) ?? supplied)
      : undefined;
    const desired = Math.min(
      Math.max(nominalTarget + adjust * x, CONTRAST_FLOOR),
      Math.min(cap, headroom),
    );
    if (env.stock && authored) {
      // Authored text stays verbatim; flag it when it sits below the floor.
      const ratio = hexRatio(authored, surface);
      if (ratio < CONTRAST_FLOOR) {
        pushDiag(
          env,
          context,
          "text",
          "below-floor",
          `authored text stays at ${ratio.toFixed(2)}:1, below ${CONTRAST_FLOOR}:1`,
        );
      }
      return { color: authored, ratio };
    }
    if (!env.stock) {
      const measured = authored ? hexRatio(authored, surface) : nominalTarget;
      const baseTarget = measured > cap ? nominalTarget : measured;
      const target = Math.min(headroom, cap, Math.max(CONTRAST_FLOOR, baseTarget + adjust * x));
      // A stronger subordinate colour is toned down; a dim candidate is
      // repaired before capping. This also handles opposite-polarity menus.
      const solved = solveForeground(authored ?? fallbackFrom, [surface], target);
      const ceiling = fallbackFrom === null ? headroom : Math.min(cap, target);
      let color = reduceToCap(solved.color, surface, ceiling);
      // Hex rounding may land just below 4.5; retain the solved value if so.
      if (hexRatio(color, surface) < Math.min(4.5, headroom)) color = solved.color;
      if (authored && authored !== color) {
        pushDiag(env, context, "text", measured > cap ? "ordered" : "adjusted", "Text adjusted for local readability and emphasis");
      }
      return { color, ratio: hexRatio(color, surface) };
    }
    if (fallbackFrom === null) {
      // Generated primary: the strongest available pole.
      const pole = strongestPole(surface);
      return { color: pole, ratio: hexRatio(pole, surface) };
    }
    const color = reduceToCap(fallbackFrom, surface, desired);
    return { color, ratio: hexRatio(color, surface) };
  };

  const primary = level(
    ctxForeground ?? (overrides?.textPrimary as string | undefined),
    TEXT_TARGET_PRIMARY,
    TEXT_ADJUST_PRIMARY,
    headroom,
    null,
  );
  if (primary.ratio < CONTRAST_FLOOR) {
    pushDiag(
      env,
      context,
      "textPrimary",
      "target-unreachable",
      `primary text reaches ${primary.ratio.toFixed(2)}:1, below ${CONTRAST_FLOOR}:1`,
    );
  }

  const secondary = level(
    overrides?.textSecondary as string | undefined,
    TEXT_TARGET_SECONDARY,
    TEXT_ADJUST_SECONDARY,
    primary.ratio,
    primary.color,
  );
  const tertiary = level(
    overrides?.textTertiary as string | undefined,
    TEXT_TARGET_TERTIARY,
    TEXT_ADJUST_TERTIARY,
    secondary.ratio,
    primary.color,
  );
  const placeholder = level(
    overrides?.placeholder as string | undefined,
    TEXT_TARGET_TERTIARY,
    TEXT_ADJUST_TERTIARY,
    secondary.ratio,
    primary.color,
  );

  return {
    primary: primary.color,
    secondary: secondary.color,
    tertiary: tertiary.color,
    placeholder: placeholder.color,
    disabled: mixHex(primary.color, surface, DISABLED_MIX),
  };
}

function resolveStatusTone(
  env: ResolveEnv,
  context: Ctx,
  surface: string,
  dark: boolean,
  track: string,
  tone: UiStatusTone,
  text: UiContextPalette["text"],
  borderControl: string,
): UiTonePalette {
  if (tone === "neutral") {
    // Neutral is structural, not a seed: borders and quiet text.
    return {
      fill: borderControl,
      text: text.tertiary,
      soft: { background: track, foreground: env.stock ? text.secondary : solveForeground(text.secondary, [track], CONTRAST_FLOOR).color },
    };
  }
  if (tone === "info") {
    return statusToneFromSeed(env, context, surface, dark, track, "info", env.accent, false);
  }
  const seeds = STATUS_SEEDS[dark ? "dark" : "light"];
  const authored = compositeOverride(env, context, tone, surface);
  return statusToneFromSeed(
    env,
    context,
    surface,
    dark,
    track,
    tone,
    authored ?? seeds[tone as "healthy" | "warning" | "high" | "critical"],
    authored !== undefined,
  );
}

function statusToneFromSeed(
  env: ResolveEnv,
  context: Ctx,
  surface: string,
  dark: boolean,
  track: string,
  tone: string,
  seed: string,
  authored: boolean,
): UiTonePalette {
  if (authored && env.stock) {
    // Authored tones stay verbatim everywhere they are consumed; flag the
    // ones that sit below the floors a derived tone would have been held to.
    if (hexRatio(seed, track) < BOUNDARY_TARGET) {
      pushDiag(env, context, `status.${tone}.fill`, "below-floor",
        `"${tone}" fill stays authored below ${BOUNDARY_TARGET}:1 on track`);
    }
    const softBg = mixHex(surface, seed, dark ? SOFT_BADGE_MIX.dark : SOFT_BADGE_MIX.light);
    if (hexRatio(seed, softBg) < CONTRAST_FLOOR) {
      pushDiag(env, context, `status.${tone}.soft`, "below-floor",
        `"${tone}" stays authored below ${CONTRAST_FLOOR}:1 on its soft badge`);
    }
    return { fill: seed, text: seed, soft: { background: softBg, foreground: seed } };
  }
  // The fill rides on `track`; make sure it separates from it.
  let fill = seed;
  if (hexRatio(fill, track) < BOUNDARY_TARGET) {
    if (!env.stock) {
      fill = solveForeground(fill, [track], BOUNDARY_TARGET).color;
    } else {
    const solved = solveOklchLightness(
      oklchOf(fill),
      rgb(track) ?? BLACK,
      BOUNDARY_TARGET,
      themeRelativeLuminance(rgb(fill) ?? BLACK) >= themeRelativeLuminance(rgb(track) ?? BLACK)
        ? "lighter"
        : "darker",
    );
    fill = hexOf(themeOklchToRgb(solved));
    }
    pushDiag(env, context, `status.${tone}.fill`, "adjusted", `fill raised to ${BOUNDARY_TARGET}:1 on track`);
  }
  const text = solveForeground(seed, [surface], CONTRAST_FLOOR).color;
  const softBg = mixHex(surface, seed, dark ? SOFT_BADGE_MIX.dark : SOFT_BADGE_MIX.light);
  const softFg = solveForeground(text, [softBg], CONTRAST_FLOOR).color;
  return { fill, text, soft: { background: softBg, foreground: softFg } };
}

function resolveProviderTone(
  surface: string,
  dark: boolean,
  tone: UiProviderTone,
): UiPair {
  const seed = PROVIDER_SEEDS[dark ? "dark" : "light"][tone];
  const softBg = mixHex(surface, seed, dark ? PROVIDER_BADGE_MIX.dark : PROVIDER_BADGE_MIX.light);
  const foreground = solveForeground(seed, [softBg], CONTRAST_FLOOR).color;
  return { background: softBg, foreground };
}

/** The window material: translucent panel tint, glass controls, shadow, scrim. */
function resolveMaterial(
  env: ResolveEnv,
  contexts: Record<Ctx, UiContextPalette>,
  glassOpacity: number,
): UiMaterialPalette {
  const toolbar = contexts.toolbar;
  // The translucent panel must keep primary text readable when the OS shows
  // pure black or pure white behind the window. Only Default retains its
  // historical authored opacity; custom themes must clear the text floor.
  const primary = rgb(toolbar.text.primary) ?? BLACK;
  const authoredOpacity = env.spec.panelOpacity;
  let panelOpacity: number;
  if (env.stock && authoredOpacity !== undefined && Number.isFinite(authoredOpacity)) {
    panelOpacity = Math.min(1, Math.max(0, authoredOpacity));
    const overBlack = mixThemeRgbColors(BLACK, rgb(env.canvas) ?? BLACK, panelOpacity);
    const overWhite = mixThemeRgbColors(WHITE, rgb(env.canvas) ?? BLACK, panelOpacity);
    const worst = Math.min(ratio(primary, overBlack), ratio(primary, overWhite));
    if (worst < CONTRAST_FLOOR) {
      pushDiag(
        env,
        "material",
        "panelOpacity",
        "below-floor",
        `authored panel opacity ${panelOpacity} keeps text at ${worst.toFixed(2)}:1 worst-case, below ${CONTRAST_FLOOR}:1`,
      );
    }
  } else {
    panelOpacity = PANEL_OPACITY_STEPS[PANEL_OPACITY_STEPS.length - 1]!;
    const candidates = !env.stock && authoredOpacity !== undefined
      ? [...new Set([Math.min(1, Math.max(0, authoredOpacity)), ...PANEL_OPACITY_STEPS])].filter(value => value >= authoredOpacity).sort((a, b) => a - b)
      : PANEL_OPACITY_STEPS;
    const foregrounds = env.stock ? [primary] : [
      contexts.canvas.text.primary, contexts.canvas.text.secondary,
      contexts.canvas.text.tertiary, contexts.canvas.text.placeholder,
    ].map(value => rgb(value)!);
    for (const opacity of candidates) {
      const overBlack = mixThemeRgbColors(BLACK, rgb(env.canvas) ?? BLACK, opacity);
      const overWhite = mixThemeRgbColors(WHITE, rgb(env.canvas) ?? BLACK, opacity);
      if (foregrounds.every(fg => Math.min(ratio(fg, overBlack), ratio(fg, overWhite)) >= 4.5)) {
        panelOpacity = opacity;
        break;
      }
    }
    if (panelOpacity > PANEL_OPACITY_START) {
      pushDiag(
        env,
        "material",
        "panelOpacity",
        "adjusted",
        `panel opacity raised to ${panelOpacity} to keep text readable over arbitrary backdrops`,
      );
    }
  }

  // Glass reads as the toolbar's highlight lifted toward the nearest pole.
  const toolbarBg = toolbar.background;
  const dark = isDarkSurface(toolbarBg);
  const highlight = shiftSurface(toolbarBg, dark ? 0.12 : 0.06);
  const blend = (amount: number) => mixHex(toolbarBg, highlight, Math.min(1, amount));
  const opacityUnit = glassOpacity / 100;
  const glassRest = blend(opacityUnit);
  const glassHover = blend(opacityUnit + 0.12);
  const glassPressed = blend(opacityUnit + 0.2);
  const glassDisabled = blend(opacityUnit * 0.5);
  const glassFg = solveForeground(toolbar.text.primary, [glassRest], CONTRAST_FLOOR).color;

  return {
    panelTint: env.canvas,
    panelOpacity,
    glass: {
      rest: { background: glassRest, foreground: glassFg },
      hover: { background: glassHover, foreground: env.stock ? glassFg : solveForeground(glassFg, [glassHover], CONTRAST_FLOOR).color },
      pressed: { background: glassPressed, foreground: env.stock ? glassFg : solveForeground(glassFg, [glassPressed], CONTRAST_FLOOR).color },
      disabled: {
        background: glassDisabled,
        foreground: mixHex(glassFg, glassDisabled, DISABLED_MIX),
      },
    },
    shadow: SHADOW_COLOR,
    scrim: SCRIM_COLOR,
  };
}
