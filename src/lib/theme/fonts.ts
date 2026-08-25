/**
 * Font preferences from Appearance settings, applied as CSS custom properties.
 */

import {
  MAX_CODE_FONT_SIZE,
  MAX_INTERFACE_FONT_SIZE,
  MIN_CODE_FONT_SIZE,
  MIN_INTERFACE_FONT_SIZE,
} from "./appearance";

export const DEFAULT_SANS_FONT_STACK =
  '"SF Pro Text", "SF Pro Display", -apple-system, BlinkMacSystemFont, system-ui, sans-serif';

export const DEFAULT_CODE_FONT_STACK =
  '"SF Mono", "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace';

function quoteFontFamilyName(name: string): string {
  const bare = name.trim();
  if (bare.length === 0) return "";
  if (/^(['"]).*\1$/.test(bare)) return bare;
  if (/^[a-zA-Z][a-zA-Z0-9-]*$/.test(bare)) return bare;
  return `"${bare.replace(/"/g, "")}"`;
}

export function cssFontFamilies(input: string): string | null {
  const families = input
    .split(",")
    .map(quoteFontFamilyName)
    .filter((name) => name.length > 0);
  return families.length > 0 ? families.join(", ") : null;
}

export function appearanceFontStack(custom: string, defaultStack: string): string {
  const families = cssFontFamilies(custom);
  return families === null ? defaultStack : `${families}, ${defaultStack}`;
}

export interface AppearanceFontPreferences {
  fontFamilySans: string;
  fontSizeInterface: number;
  fontFamilyCode: string;
  fontSizeCode: number;
  fontSmoothing: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function applyAppearanceFontVariables(
  root: HTMLElement,
  prefs: AppearanceFontPreferences,
): void {
  const interfaceSize = clamp(
    prefs.fontSizeInterface,
    MIN_INTERFACE_FONT_SIZE,
    MAX_INTERFACE_FONT_SIZE,
  );
  const codeSize = clamp(prefs.fontSizeCode, MIN_CODE_FONT_SIZE, MAX_CODE_FONT_SIZE);

  root.style.setProperty(
    "--font-sans",
    appearanceFontStack(prefs.fontFamilySans, DEFAULT_SANS_FONT_STACK),
  );
  root.style.setProperty(
    "--font-mono",
    appearanceFontStack(prefs.fontFamilyCode, DEFAULT_CODE_FONT_STACK),
  );
  root.style.setProperty("--font-size-interface", `${interfaceSize}px`);
  root.style.setProperty("--font-size-code", `${codeSize}px`);
  root.style.setProperty(
    "-webkit-font-smoothing",
    prefs.fontSmoothing ? "antialiased" : "auto",
  );

  // Do NOT set root.style.fontSize — that redefines 1rem and shrinks every
  // Tailwind rem utility (including the fit-corner hit target), which clips
  // the corner grip under .app-shell { overflow: hidden; border-radius }.
  // Body already uses --font-size-interface. Clear any leftover inline size.
  root.style.removeProperty("font-size");
}

export function clearAppearanceFontVariables(root: HTMLElement): void {
  root.style.removeProperty("--font-sans");
  root.style.removeProperty("--font-mono");
  root.style.removeProperty("--font-size-interface");
  root.style.removeProperty("--font-size-code");
  root.style.removeProperty("-webkit-font-smoothing");
  root.style.removeProperty("font-size");
}

const FONT_PROBE_TEXT = "mmmmmmmmMMWli1O0@# fjord";
let fontProbeContext: CanvasRenderingContext2D | null | undefined;

function probeWidth(fontList: string): number | null {
  if (fontProbeContext === undefined) {
    fontProbeContext = document.createElement("canvas").getContext("2d");
  }
  if (fontProbeContext === null) return null;
  fontProbeContext.font = `16px ${fontList}`;
  return fontProbeContext.measureText(FONT_PROBE_TEXT).width;
}

/** True when the family is installed (canvas metric probe — not document.fonts.check). */
export function isFontFamilyAvailable(family: string): boolean {
  const families = cssFontFamilies(family);
  if (families === null) return false;
  if (/^(system-ui|sans-serif|serif|monospace|ui-monospace)$/i.test(families)) return true;
  try {
    for (const generic of ["monospace", "serif", "sans-serif"]) {
      const baseline = probeWidth(generic);
      const candidate = probeWidth(`${families}, ${generic}`);
      if (baseline === null || candidate === null) return false;
      if (candidate !== baseline) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Curated interface faces; availability is probed per machine. */
export const CURATED_SANS_FONT_FAMILIES = [
  "SF Pro Text",
  "SF Pro Display",
  "Helvetica Neue",
  "Helvetica",
  "Arial",
  "Avenir Next",
  "Avenir",
  "Futura",
  "Gill Sans",
  "Optima",
  "Verdana",
  "Tahoma",
  "Trebuchet MS",
  "Segoe UI",
  "Roboto",
  "Inter",
  "IBM Plex Sans",
  "Source Sans 3",
  "Source Sans Pro",
  "Noto Sans",
  "Ubuntu",
  "Cantarell",
  "DejaVu Sans",
  "Liberation Sans",
  "Georgia",
  "Palatino",
  "Baskerville",
  "Charter",
  "New York",
  "Times New Roman",
] as const;

/** Curated monospace faces for the code font menu. */
export const CURATED_MONO_FONT_FAMILIES = [
  "SF Mono",
  "SFMono-Regular",
  "Menlo",
  "Monaco",
  "Consolas",
  "Cascadia Code",
  "Cascadia Mono",
  "JetBrains Mono",
  "Fira Code",
  "Fira Mono",
  "Source Code Pro",
  "IBM Plex Mono",
  "Roboto Mono",
  "Ubuntu Mono",
  "Noto Sans Mono",
  "DejaVu Sans Mono",
  "Liberation Mono",
  "Courier New",
  "Andale Mono",
] as const;

const MONOSPACE_PROBE_GLYPHS = ["i", "M", "W", "0", "@", "#", ".", " "] as const;

/** True when the face measures as monospace (equal advances). */
export function isMonospaceFamily(family: string): boolean {
  const families = cssFontFamilies(family);
  if (families === null) return true;
  try {
    if (fontProbeContext === undefined) {
      fontProbeContext = document.createElement("canvas").getContext("2d");
    }
    if (fontProbeContext === null) return true;
    fontProbeContext.font = `32px ${families}, monospace`;
    const advances = MONOSPACE_PROBE_GLYPHS.map((glyph) => fontProbeContext!.measureText(glyph).width);
    const reference = advances[0];
    if (reference === undefined || reference <= 0) return true;
    return advances.every(
      (advance) => Number.isFinite(advance) && advance > 0 && Math.abs(advance - reference) < 0.01,
    );
  } catch {
    return true;
  }
}

function resolveDefaultLabelFromStack(stack: string, fallback: string): string {
  for (const raw of stack.split(",")) {
    const family = raw.trim().replace(/^(['"])(.*)\1$/, "$2");
    if (family.length === 0) continue;
    if (
      /^(system-ui|sans-serif|serif|monospace|ui-monospace|-apple-system|BlinkMacSystemFont)$/i.test(
        family,
      )
    ) {
      continue;
    }
    if (isFontFamilyAvailable(family)) return family;
  }
  return fallback;
}

export function resolveDefaultSansLabel(): string {
  return resolveDefaultLabelFromStack(DEFAULT_SANS_FONT_STACK, "System default");
}

export function resolveDefaultMonoLabel(): string {
  return resolveDefaultLabelFromStack(DEFAULT_CODE_FONT_STACK, "SF Mono");
}

async function queryLocalFontFamilies(): Promise<readonly string[] | null> {
  const query = (
    window as Window & {
      queryLocalFonts?: () => Promise<ReadonlyArray<{ readonly family: string }>>;
    }
  ).queryLocalFonts;

  if (typeof query !== "function") return null;
  try {
    const fonts = await query.call(window);
    const families = [...new Set(fonts.map((font) => font.family))]
      .filter((family) => !family.startsWith("."))
      .sort((left, right) => left.localeCompare(right));
    return families.length > 0 ? families : null;
  } catch {
    return null;
  }
}

/**
 * Families for the interface font menu. Prefers Local Font Access when the
 * engine exposes it; otherwise the curated catalog filtered to installed faces.
 */
export async function listInterfaceFontFamilies(): Promise<readonly string[]> {
  const local = await queryLocalFontFamilies();
  if (local) return local;
  return CURATED_SANS_FONT_FAMILIES.filter((family) => isFontFamilyAvailable(family));
}

/** Families for the code / mono font menu. */
export async function listMonoFontFamilies(): Promise<readonly string[]> {
  const local = await queryLocalFontFamilies();
  if (local) return local.filter((family) => isMonospaceFamily(family));
  return CURATED_MONO_FONT_FAMILIES.filter((family) => isFontFamilyAvailable(family));
}
