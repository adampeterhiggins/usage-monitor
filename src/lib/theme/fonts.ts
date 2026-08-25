/**
 * Font preferences from Appearance settings, applied as CSS custom properties.
 */

import {
  DEFAULT_INTERFACE_FONT_SIZE,
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

  // Keep body text in sync with the interface size preference.
  root.style.fontSize = `${interfaceSize || DEFAULT_INTERFACE_FONT_SIZE}px`;
}

export function clearAppearanceFontVariables(root: HTMLElement): void {
  root.style.removeProperty("--font-sans");
  root.style.removeProperty("--font-mono");
  root.style.removeProperty("--font-size-interface");
  root.style.removeProperty("--font-size-code");
  root.style.removeProperty("-webkit-font-smoothing");
  root.style.fontSize = `${DEFAULT_INTERFACE_FONT_SIZE}px`;
}
