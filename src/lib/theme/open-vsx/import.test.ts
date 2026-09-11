import JSZip from "jszip";
import { sha256 } from "@noble/hashes/sha2.js";
import { describe, expect, it, vi } from "vitest";

import type { OpenVsxThemeExtension } from "./client";
import { importOpenVsxThemeExtension } from "./import";
import { loadThemeObject, normalizePackagePath, openThemePackage } from "./archive";

const { mockFetchText, mockFetchBytes } = vi.hoisted(() => ({
  mockFetchText: vi.fn(),
  mockFetchBytes: vi.fn(),
}));

vi.mock("../../platform/http", () => ({
  fetchText: mockFetchText,
  fetchBytes: mockFetchBytes,
  header: (headers: Record<string, string>, name: string) =>
    Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1],
  HttpError: class HttpError extends Error {
    status = 0;
  },
}));

const EXTENSION: OpenVsxThemeExtension = {
  id: "mock.publisher-theme",
  collectionId: "open-vsx:mock.publisher-theme",
  name: "Mock Theme Pack",
  publisher: "mock",
  description: "",
  downloadCount: 10,
  iconUrl: null,
  sourceUrl: null,
  manifestUrl: "https://open-vsx.org/api/mock/publisher-theme/1.0.0/file/package.json",
  sha256Url: "https://open-vsx.org/api/mock/publisher-theme/1.0.0/file/sha256",
  vsixUrl: "https://open-vsx.org/api/mock/publisher-theme/1.0.0/file/pack.vsix",
  version: "1.0.0",
  license: "MIT",
};

const THEME_LIGHT = {
  colors: {
    "editor.background": "#ffffff",
    "editor.foreground": "#111111",
    "focusBorder": "#0066cc",
  },
};

const THEME_DARK = {
  colors: {
    "editor.background": "#1b1b1f",
    "editor.foreground": "#eeeeee",
    "focusBorder": "#66aaff",
  },
};

function textResponse(body: string, status = 200) {
  return { status, headers: {}, body };
}

async function buildVsix(
  files: Record<string, string>,
  manifest: Record<string, unknown>,
): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("extension/package.json", JSON.stringify(manifest));
  for (const [path, body] of Object.entries(files)) {
    zip.file(`extension/${path}`, body);
  }
  return zip.generateAsync({ type: "uint8array" });
}

function manifestWithThemes(themes: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    publisher: "mock",
    name: "publisher-theme",
    version: "1.0.0",
    license: "MIT",
    contributes: { themes },
  };
}

function stubDownloads(packageBytes: Uint8Array, manifest?: Record<string, unknown>) {
  const m =
    manifest ??
    manifestWithThemes([
      { label: "Mock Light", uiTheme: "vs", path: "./themes/light.json" },
      { label: "Mock Dark", uiTheme: "vs-dark", path: "./themes/dark.json" },
    ]);
  const checksum = [...sha256(packageBytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  mockFetchText.mockImplementation(async (url: string) => {
    if (url === EXTENSION.manifestUrl) return textResponse(JSON.stringify(m));
    if (url === EXTENSION.sha256Url) return textResponse(checksum);
    return textResponse("not found", 404);
  });
  mockFetchBytes.mockResolvedValue({ status: 200, headers: {}, bytes: packageBytes });
}

describe("normalizePackagePath", () => {
  it("anchors relative paths under extension/", () => {
    expect(normalizePackagePath("./themes/a.json")).toBe("extension/themes/a.json");
    expect(normalizePackagePath("themes/a.json")).toBe("extension/themes/a.json");
  });

  it("resolves includes relative to the including file", () => {
    expect(normalizePackagePath("../shared/base.json", "extension/themes/a.json")).toBe(
      "extension/shared/base.json",
    );
  });

  it("rejects traversal that escapes the package root", () => {
    expect(() => normalizePackagePath("../../etc/passwd", "extension/themes/a.json")).toThrow(
      /escapes/,
    );
    expect(() => normalizePackagePath("/abs/path.json")).toThrow(/safe relative/);
    expect(() => normalizePackagePath("C:\\win.json")).toThrow(/safe relative/);
  });
});

describe("openThemePackage", () => {
  it("rejects bytes without a ZIP directory", async () => {
    await expect(openThemePackage(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow(
      /no ZIP directory|could not be opened/,
    );
  });

  it("opens a well-formed package", async () => {
    const bytes = await buildVsix({ "themes/light.json": JSON.stringify(THEME_LIGHT) },
      manifestWithThemes([{ label: "Mock Light", uiTheme: "vs", path: "./themes/light.json" }]));
    const zip = await openThemePackage(bytes);
    expect(zip.file("extension/package.json")).not.toBeNull();
  });
});

describe("loadThemeObject", () => {
  it("resolves include chains and merges colors", async () => {
    const bytes = await buildVsix(
      {
        "themes/base.json": JSON.stringify({
          colors: { "editor.background": "#101010" },
        }),
        "themes/child.json": JSON.stringify({
          include: "./base.json",
          colors: { "editor.foreground": "#ffffff" },
        }),
      },
      manifestWithThemes([]),
    );
    const zip = await openThemePackage(bytes);
    const value = await loadThemeObject(
      zip,
      "extension/themes/child.json",
      new Map(),
      { files: 0 },
    );
    expect(value.colors).toEqual({
      "editor.background": "#101010",
      "editor.foreground": "#ffffff",
    });
  });

  it("rejects include cycles", async () => {
    const bytes = await buildVsix(
      {
        "a.json": JSON.stringify({ include: "./b.json", colors: {} }),
        "b.json": JSON.stringify({ include: "./a.json", colors: {} }),
      },
      manifestWithThemes([]),
    );
    const zip = await openThemePackage(bytes);
    await expect(
      loadThemeObject(zip, "extension/a.json", new Map(), { files: 0 }),
    ).rejects.toThrow(/cycle|deeply/);
  });
});

describe("importOpenVsxThemeExtension", () => {
  it("imports a valid multi-theme extension as a paired collection", async () => {
    const manifest = manifestWithThemes([
      { label: "Mock Light", uiTheme: "vs", path: "./themes/light.json" },
      { label: "Mock Dark", uiTheme: "vs-dark", path: "./themes/dark.json" },
    ]);
    const bytes = await buildVsix(
      {
        "themes/light.json": JSON.stringify(THEME_LIGHT),
        "themes/dark.json": JSON.stringify(THEME_DARK),
      },
      manifest,
    );
    stubDownloads(bytes, manifest);

    const themes = await importOpenVsxThemeExtension(EXTENSION);
    expect(themes.length).toBeGreaterThan(0);
    for (const theme of themes) {
      expect(theme.id).toMatch(/^ovx-theme-/);
      expect(theme.collection?.id).toBe(EXTENSION.collectionId);
    }
    // Light + dark contributions of the same name family pair into one theme.
    expect(themes.some((t) => t.variants?.dark || t.appearance === "dark")).toBe(true);
  });

  it("rejects when the checksum does not match the package", async () => {
    const bytes = await buildVsix(
      { "themes/light.json": JSON.stringify(THEME_LIGHT) },
      manifestWithThemes([{ label: "L", uiTheme: "vs", path: "./themes/light.json" }]),
    );
    const manifest = manifestWithThemes([
      { label: "L", uiTheme: "vs", path: "./themes/light.json" },
    ]);
    stubDownloads(bytes, manifest);
    mockFetchText.mockImplementation(async (url: string) => {
      if (url === EXTENSION.sha256Url) return textResponse("0".repeat(64));
      if (url === EXTENSION.manifestUrl) return textResponse(JSON.stringify(manifest));
      return textResponse("not found", 404);
    });

    await expect(importOpenVsxThemeExtension(EXTENSION)).rejects.toThrow(/integrity/);
  });

  it("rejects when the packaged manifest does not match the registry identity", async () => {
    const mismatched = manifestWithThemes([
      { label: "L", uiTheme: "vs", path: "./themes/light.json" },
    ]);
    mismatched.publisher = "someone-else";
    const bytes = await buildVsix(
      { "themes/light.json": JSON.stringify(THEME_LIGHT) },
      mismatched,
    );
    // Advertised manifest still matches the registry listing.
    stubDownloads(
      bytes,
      manifestWithThemes([{ label: "L", uiTheme: "vs", path: "./themes/light.json" }]),
    );

    await expect(importOpenVsxThemeExtension(EXTENSION)).rejects.toThrow(
      /does not match the selected/,
    );
  });

  it("rejects a package whose theme path escapes the archive root", async () => {
    const manifest = manifestWithThemes([
      { label: "Evil", uiTheme: "vs", path: "../../outside.json" },
    ]);
    const zip = new JSZip();
    zip.file("extension/package.json", JSON.stringify(manifest));
    zip.file("outside.json", JSON.stringify(THEME_LIGHT));
    const bytes = await zip.generateAsync({ type: "uint8array" });
    stubDownloads(bytes, manifest);

    await expect(importOpenVsxThemeExtension(EXTENSION)).rejects.toThrow(
      /could not be imported safely/,
    );
  });
});
