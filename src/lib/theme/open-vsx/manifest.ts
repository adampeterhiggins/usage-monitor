/** JSONC document and extension-manifest helpers shared by the Open VSX client,
 *  archive reader, and import orchestration. */

import { parse, type ParseError } from "jsonc-parser";

import { isRecord } from "../types";

export type ThemeContribution = { label?: unknown; uiTheme?: unknown; path?: unknown };

export function parseJsoncObject(source: string, description: string): Record<string, unknown> {
  const errors: ParseError[] = [];
  const value: unknown = parse(source, errors, { allowTrailingComma: true });
  if (errors.length > 0 || !isRecord(value)) throw new Error(`${description} is not valid JSON.`);
  return value;
}

export function themeContributions(manifest: Record<string, unknown>): ThemeContribution[] {
  const contributes = isRecord(manifest.contributes) ? manifest.contributes : null;
  return Array.isArray(contributes?.themes)
    ? (contributes.themes.filter(isRecord) as ThemeContribution[])
    : [];
}

export function manifestLicenseMatches(manifest: Record<string, unknown>, license: string): boolean {
  return (
    typeof manifest.license === "string" &&
    manifest.license.trim().toLowerCase() === license.toLowerCase()
  );
}

export function contributionType(uiTheme: unknown): string | null {
  if (uiTheme === "vs") return "light";
  if (uiTheme === "vs-dark") return "dark";
  if (uiTheme === "hc-black" || uiTheme === "hc-light") return uiTheme;
  return null;
}
