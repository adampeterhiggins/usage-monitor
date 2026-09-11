/** Turn a validated Open VSX extension into app theme definitions: fetch the
 *  manifest and verified package, confirm identity, then convert each theme
 *  contribution through the VS Code importer. */

import type { ThemeDefinition } from "../types";
import {
  isVsCodeThemeFile,
  pairVsCodeThemes,
  parseVsCodeThemeFile,
  resolveThemeLabelCollisions,
} from "../vscodeImport";
import {
  loadThemeObject,
  normalizePackagePath,
  openThemePackage,
  readZipText,
} from "./archive";
import {
  fetchOpenVsxManifest,
  fetchVerifiedOpenVsxPackage,
  openVsxThemeId,
  type OpenVsxThemeExtension,
} from "./client";
import {
  contributionType,
  manifestLicenseMatches,
  parseJsoncObject,
  themeContributions,
} from "./manifest";

const MAX_THEMES_PER_EXTENSION = 40;

export async function importOpenVsxThemeExtension(
  extension: OpenVsxThemeExtension,
  signal?: AbortSignal,
): Promise<ReadonlyArray<ThemeDefinition>> {
  const manifest = await fetchOpenVsxManifest(extension, signal);
  const advertisedContributions = themeContributions(manifest);
  if (advertisedContributions.length === 0) {
    throw new Error("That extension does not contain color themes.");
  }
  if (advertisedContributions.length > MAX_THEMES_PER_EXTENSION) {
    throw new Error("That extension contains too many color themes to import safely.");
  }

  const packageBytes = await fetchVerifiedOpenVsxPackage(extension, signal);
  signal?.throwIfAborted();
  const zip = await openThemePackage(packageBytes, signal);

  const packagedManifest = parseJsoncObject(
    await readZipText(zip, "extension/package.json", "Extension manifest", signal),
    "Extension manifest",
  );
  if (
    typeof packagedManifest.publisher !== "string" ||
    packagedManifest.publisher.toLowerCase() !== extension.publisher.toLowerCase() ||
    typeof packagedManifest.name !== "string" ||
    `${packagedManifest.publisher}.${packagedManifest.name}`.toLowerCase() !==
      extension.id.toLowerCase() ||
    packagedManifest.version !== extension.version
  ) {
    throw new Error("That extension package does not match the selected Open VSX theme.");
  }
  if (!manifestLicenseMatches(packagedManifest, extension.license)) {
    throw new Error("That extension package does not match its advertised license.");
  }
  const contributions = themeContributions(packagedManifest);
  if (contributions.length === 0) throw new Error("That extension does not contain color themes.");
  if (contributions.length > MAX_THEMES_PER_EXTENSION) {
    throw new Error("That extension contains too many color themes to import safely.");
  }

  const parsed: Array<{ theme: ThemeDefinition; sourceName: string; sourcePath: string }> = [];
  const failures: string[] = [];
  const themeCache = new Map<string, Record<string, unknown>>();
  const themeBudget = { files: 0 };
  for (const contribution of contributions) {
    signal?.throwIfAborted();
    if (typeof contribution.path !== "string") {
      failures.push("theme path is missing");
      continue;
    }
    try {
      const path = normalizePackagePath(contribution.path);
      const themeValue = await loadThemeObject(
        zip,
        path,
        themeCache,
        themeBudget,
        new Set(),
        signal,
      );
      const type = contributionType(contribution.uiTheme);
      const label =
        typeof contribution.label === "string" && contribution.label.trim()
          ? contribution.label.trim()
          : extension.name;
      const decorated = {
        ...themeValue,
        displayName: label,
        ...(type ? { type } : {}),
      };
      if (!isVsCodeThemeFile(decorated)) throw new Error("not a VS Code color theme");
      parsed.push({
        theme: parseVsCodeThemeFile(decorated),
        sourceName: path.split("/").slice(-1)[0]!,
        sourcePath: path,
      });
    } catch (cause) {
      signal?.throwIfAborted();
      failures.push(cause instanceof Error ? cause.message : "theme could not be read");
    }
  }
  if (failures.length > 0) {
    throw new Error("One or more color themes in that extension could not be imported safely.");
  }
  if (parsed.length === 0) {
    throw new Error("That extension has no compatible color themes.");
  }
  const extensionId = extension.id.toLowerCase();
  const sourcePathCounts = new Map<string, number>();
  for (const { sourcePath } of parsed) {
    sourcePathCounts.set(sourcePath, (sourcePathCounts.get(sourcePath) ?? 0) + 1);
  }
  const sourcePathOccurrences = new Map<string, number>();
  const sourceIdentities = parsed.map(({ sourcePath }) => {
    if (sourcePathCounts.get(sourcePath) === 1) return sourcePath;
    const occurrence = sourcePathOccurrences.get(sourcePath) ?? 0;
    sourcePathOccurrences.set(sourcePath, occurrence + 1);
    return occurrence === 0 ? sourcePath : `${sourcePath}\0${occurrence}`;
  });
  const resolved = resolveThemeLabelCollisions(parsed).map((theme, index) => ({
    ...theme,
    id: openVsxThemeId(extensionId, sourceIdentities[index]!),
  }));
  const paired = pairVsCodeThemes(resolved, {
    pairedId: (light, dark) => openVsxThemeId(extensionId, [light.id, dark.id].sort().join(":")),
  });
  const themes = resolveThemeLabelCollisions(paired.map((theme) => ({ theme })));
  const collection = {
    id: extension.collectionId,
    label: extension.name.slice(0, 48),
  };
  return themes.map((theme) => ({ ...theme, collection }));
}
