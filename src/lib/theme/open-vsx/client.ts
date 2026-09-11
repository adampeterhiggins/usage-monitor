/** Open VSX registry requests: search, detail hydration, package download, and
 *  response normalization. Everything the registry sends is validated here
 *  before archive/import code sees it. */

import { sha256 } from "@noble/hashes/sha2.js";

import { fetchBytes, fetchText, header } from "../../../platform/http";
import { isRecord } from "../types";
import {
  manifestLicenseMatches,
  parseJsoncObject,
  themeContributions,
} from "./manifest";

const OPEN_VSX_SEARCH_URL = "https://open-vsx.org/api/-/search";
const MAX_VSIX_BYTES = 20 * 1024 * 1024;
const MAX_SEARCH_BYTES = 512 * 1024;
const MAX_DETAIL_BYTES = 256 * 1024;
const MAX_MANIFEST_BYTES = 256 * 1024;
const SEARCH_REQUEST_TIMEOUT_MS = 10_000;
const SUPPORTED_LICENSES = new Set([
  "0BSD",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC0-1.0",
  "ISC",
  "MIT",
  "MPL-2.0",
  "Unlicense",
]);

export type OpenVsxThemeSort = "downloadCount" | "rating" | "timestamp" | "relevance";

export type OpenVsxThemeExtension = {
  id: string;
  collectionId: string;
  name: string;
  publisher: string;
  description: string;
  downloadCount: number;
  iconUrl: string | null;
  sourceUrl: string | null;
  manifestUrl: string;
  sha256Url: string;
  vsixUrl: string;
  version: string;
  license: string;
};

export const OPEN_VSX_SEARCH_PAGE_SIZE = 16;
const OPEN_VSX_SEARCH_MAX_SIZE = 32;
const RANDOM_THEME_HYDRATE_LIMIT = 5;

export type OpenVsxThemeSearchOptions = {
  signal?: AbortSignal;
  sortBy?: OpenVsxThemeSort;
  offset?: number;
  size?: number;
};

export type OpenVsxThemeSearchPage = {
  extensions: OpenVsxThemeExtension[];
  offset: number;
  totalSize: number;
  fetched: number;
};

type OpenVsxSearchHits = {
  identities: Array<[string, string]>;
  offset: number;
  totalSize: number;
};

let cachedCatalogSize = 0;

function shortHash(value: string): string {
  return [...sha256(new TextEncoder().encode(value))]
    .slice(0, 6)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Stable theme id for a contribution inside an extension package. */
export function openVsxThemeId(extensionId: string, source: string): string {
  return `ovx-theme-${shortHash(`${extensionId}:${source}`)}`;
}

export function openVsxCollectionId(extensionId: string): string {
  const normalized = `open-vsx:${extensionId.toLowerCase()}`;
  return /^[a-z0-9][a-z0-9.:-]{0,127}$/.test(normalized)
    ? normalized
    : `open-vsx:${shortHash(extensionId)}`;
}

function trustedOpenVsxUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.toLowerCase() === "open-vsx.org"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function publicSourceUrl(value: unknown): string | null {
  const rawValue =
    typeof value === "string"
      ? value
      : isRecord(value) && typeof value.url === "string"
        ? value.url
        : null;
  if (!rawValue) return null;
  try {
    const url = new URL(rawValue);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

function extensionFromDetail(value: unknown): OpenVsxThemeExtension | null {
  if (!isRecord(value) || !isRecord(value.files)) {
    throw new Error("Open VSX returned malformed theme details.");
  }
  const namespace = typeof value.namespace === "string" ? value.namespace.trim() : "";
  const extensionName = typeof value.name === "string" ? value.name.trim() : "";
  const displayName =
    (typeof value.displayName === "string" ? value.displayName.trim() : "") || extensionName;
  const version = typeof value.version === "string" ? value.version.trim() : "";
  const license = typeof value.license === "string" ? value.license.trim() : "";
  const manifestUrl = trustedOpenVsxUrl(value.files.manifest);
  const sha256Url = trustedOpenVsxUrl(value.files.sha256);
  const vsixUrl = trustedOpenVsxUrl(value.files.download);
  if (!namespace || !extensionName || !version || !manifestUrl || !sha256Url || !vsixUrl) {
    throw new Error("Open VSX returned malformed theme details.");
  }
  if (!SUPPORTED_LICENSES.has(license)) return null;
  const id = `${namespace}.${extensionName}`;
  return {
    id,
    collectionId: openVsxCollectionId(id),
    name: displayName,
    publisher: namespace,
    description: typeof value.description === "string" ? value.description : "",
    downloadCount:
      typeof value.downloadCount === "number" && Number.isFinite(value.downloadCount)
        ? value.downloadCount
        : 0,
    iconUrl: trustedOpenVsxUrl(value.files.icon),
    sourceUrl:
      publicSourceUrl(value.repository) ??
      publicSourceUrl(value.homepage) ??
      publicSourceUrl(value.url),
    manifestUrl,
    sha256Url,
    vsixUrl,
    version,
    license,
  };
}

async function withSearchTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  parentSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (parentSignal?.aborted) abort();
  else parentSignal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, SEARCH_REQUEST_TIMEOUT_MS);
  try {
    return await operation(controller.signal);
  } catch (cause) {
    if (controller.signal.aborted && !parentSignal?.aborted) {
      throw new Error("Open VSX took too long to respond.");
    }
    throw cause;
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener("abort", abort);
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

function clampSearchSize(size: number | undefined): number {
  const requested = size ?? OPEN_VSX_SEARCH_PAGE_SIZE;
  if (!Number.isFinite(requested)) return OPEN_VSX_SEARCH_PAGE_SIZE;
  return Math.min(OPEN_VSX_SEARCH_MAX_SIZE, Math.max(1, Math.floor(requested)));
}

function clampSearchOffset(offset: number | undefined): number {
  if (offset === undefined || !Number.isFinite(offset) || offset <= 0) return 0;
  return Math.floor(offset);
}

async function fetchOpenVsxSearchHits(
  query: string,
  { signal, sortBy = "downloadCount", offset = 0, size }: OpenVsxThemeSearchOptions = {},
): Promise<OpenVsxSearchHits> {
  const searchText = query.trim();
  const url = new URL(OPEN_VSX_SEARCH_URL);
  if (searchText) url.searchParams.set("query", searchText);
  url.searchParams.set("category", "Themes");
  url.searchParams.set("sortBy", sortBy);
  url.searchParams.set("sortOrder", "desc");
  url.searchParams.set("offset", String(clampSearchOffset(offset)));
  // Ask for a few extras because results without a supported SPDX license
  // are intentionally omitted.
  url.searchParams.set("size", String(clampSearchSize(size)));
  const value = await withSearchTimeout(async (requestSignal) => {
    const response = await fetchText(url.toString(), { signal: requestSignal });
    if (response.status < 200 || response.status >= 300) {
      throw new Error("Open VSX search is unavailable right now.");
    }
    if (response.body.length > MAX_SEARCH_BYTES) {
      throw new Error("Open VSX returned an unexpectedly large response.");
    }
    try {
      return JSON.parse(response.body) as unknown;
    } catch {
      throw new Error("Open VSX returned an unreadable response.");
    }
  }, signal);
  if (!isRecord(value) || !Array.isArray(value.extensions)) {
    throw new Error("Open VSX returned an unreadable search response.");
  }
  const identities = value.extensions.flatMap((candidate): Array<[string, string]> => {
    if (!isRecord(candidate)) return [];
    const namespace = typeof candidate.namespace === "string" ? candidate.namespace : "";
    const name = typeof candidate.name === "string" ? candidate.name : "";
    return namespace && name ? [[namespace, name]] : [];
  });
  const reportedSize =
    typeof value.totalSize === "number" && Number.isFinite(value.totalSize)
      ? Math.max(0, Math.floor(value.totalSize))
      : 0;
  const totalSize = reportedSize > 0 ? reportedSize : cachedCatalogSize || identities.length;
  if (!searchText && totalSize > 0) cachedCatalogSize = totalSize;
  // The registry often echoes offset: 0 even when a later page was requested.
  // Pagination has to advance from the offset we asked for.
  return { identities, offset: clampSearchOffset(offset), totalSize };
}

async function hydrateOpenVsxExtension(
  namespace: string,
  name: string,
  signal?: AbortSignal,
): Promise<OpenVsxThemeExtension | null> {
  return withSearchTimeout(async (requestSignal) => {
    const detailUrl = `https://open-vsx.org/api/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
    const detailResponse = await fetchText(detailUrl, { signal: requestSignal });
    if (detailResponse.status < 200 || detailResponse.status >= 300) {
      throw new Error("Open VSX theme details are unavailable.");
    }
    if (detailResponse.body.length > MAX_DETAIL_BYTES) {
      throw new Error("Open VSX returned an unexpectedly large detail response.");
    }
    try {
      const extension = extensionFromDetail(JSON.parse(detailResponse.body));
      if (!extension) return null;
      const [manifestResponse, packageResponse] = await Promise.all([
        fetchText(extension.manifestUrl, { signal: requestSignal }),
        fetchText(extension.vsixUrl, { method: "HEAD", signal: requestSignal }),
      ]);
      if (manifestResponse.status < 200 || manifestResponse.status >= 300) {
        throw new Error("manifest unavailable");
      }
      if (packageResponse.status < 200 || packageResponse.status >= 300) return null;
      const packageLength = Number(header(packageResponse.headers, "content-length"));
      if (Number.isFinite(packageLength) && packageLength > MAX_VSIX_BYTES) {
        return null;
      }
      if (manifestResponse.body.length > MAX_MANIFEST_BYTES) {
        throw new Error("Open VSX returned an unexpectedly large manifest.");
      }
      const manifest = parseJsoncObject(manifestResponse.body, "Extension manifest");
      return themeContributions(manifest).length > 0 &&
        manifestLicenseMatches(manifest, extension.license)
        ? extension
        : null;
    } catch (error) {
      if (isAbortError(error) || requestSignal.aborted) throw error;
      throw new Error("Open VSX returned unreadable theme details.");
    }
  }, signal);
}

export async function searchOpenVsxThemes(
  query: string,
  options: OpenVsxThemeSearchOptions = {},
): Promise<OpenVsxThemeSearchPage> {
  const hits = await fetchOpenVsxSearchHits(query, options);
  const details = await Promise.allSettled(
    hits.identities.map(([namespace, name]) =>
      hydrateOpenVsxExtension(namespace, name, options.signal),
    ),
  );
  if (options.signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
  const completedDetails = details.filter((result) => result.status === "fulfilled");
  if (hits.identities.length > 0 && completedDetails.length === 0) {
    throw new Error("Open VSX theme details are unavailable right now.");
  }
  return {
    extensions: completedDetails.flatMap((result) => (result.value ? [result.value] : [])),
    offset: hits.offset,
    totalSize: hits.totalSize,
    fetched: hits.identities.length,
  };
}

function shuffleInPlace<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const current = items[i]!;
    items[i] = items[j]!;
    items[j] = current;
  }
  return items;
}

function pickFromExtensions(
  items: ReadonlyArray<OpenVsxThemeExtension>,
  excludeIds?: ReadonlySet<string>,
): OpenVsxThemeExtension | null {
  const unused = excludeIds ? items.filter((item) => !excludeIds.has(item.id)) : [...items];
  const pool = unused.length > 0 ? unused : items;
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}

export async function pickRandomOpenVsxTheme(
  {
    signal,
    excludeIds,
    fallback = [],
  }: {
    signal?: AbortSignal;
    excludeIds?: ReadonlySet<string>;
    fallback?: ReadonlyArray<OpenVsxThemeExtension>;
  } = {},
): Promise<OpenVsxThemeExtension> {
  try {
    const totalSize =
      cachedCatalogSize > 0
        ? cachedCatalogSize
        : (await fetchOpenVsxSearchHits("", { signal, offset: 0, size: 1 })).totalSize;
    if (totalSize > 0) {
      const offset = Math.floor(Math.random() * totalSize);
      const hits = await fetchOpenVsxSearchHits("", {
        signal,
        offset,
        size: OPEN_VSX_SEARCH_PAGE_SIZE,
      });
      let hydrates = 0;
      for (const [namespace, name] of shuffleInPlace([...hits.identities])) {
        if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
        if (hydrates >= RANDOM_THEME_HYDRATE_LIMIT) break;
        hydrates += 1;
        try {
          const extension = await hydrateOpenVsxExtension(namespace, name, signal);
          if (extension && !excludeIds?.has(extension.id)) return extension;
        } catch (error) {
          if (isAbortError(error) || signal?.aborted) throw error;
        }
      }
    }
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) throw error;
  }

  const fromFallback = pickFromExtensions(fallback, excludeIds);
  if (fromFallback) return fromFallback;

  throw new Error("Couldn’t find another Open VSX theme to try.");
}

/** Fetch and parse the registry-advertised extension manifest. */
export async function fetchOpenVsxManifest(
  extension: OpenVsxThemeExtension,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const manifestResponse = await fetchText(extension.manifestUrl, signal ? { signal } : {});
  if (manifestResponse.status < 200 || manifestResponse.status >= 300) {
    throw new Error("That Open VSX extension has no readable manifest.");
  }
  if (manifestResponse.body.length > MAX_MANIFEST_BYTES) {
    throw new Error("That Open VSX extension manifest is too large.");
  }
  return parseJsoncObject(manifestResponse.body, "Extension manifest");
}

/** Download the .vsix package and verify it against the registry checksum. */
export async function fetchVerifiedOpenVsxPackage(
  extension: OpenVsxThemeExtension,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const response = await fetchBytes(extension.vsixUrl, signal ? { signal } : {});
  if (response.status < 200 || response.status >= 300) {
    throw new Error("That Open VSX theme could not be downloaded.");
  }
  if (response.bytes.byteLength > MAX_VSIX_BYTES) {
    throw new Error("That theme extension is too large to import safely.");
  }
  const packageBytes = response.bytes;

  signal?.throwIfAborted();
  const checksumResponse = await fetchText(extension.sha256Url, signal ? { signal } : {});
  if (checksumResponse.status < 200 || checksumResponse.status >= 300) {
    throw new Error("That Open VSX theme has no readable checksum.");
  }
  if (checksumResponse.body.length > 256) {
    throw new Error("That Open VSX checksum response is invalid.");
  }
  const expectedChecksum = checksumResponse.body.trim().split(/\s+/)[0];
  if (!expectedChecksum || !/^[a-f\d]{64}$/i.test(expectedChecksum)) {
    throw new Error("That Open VSX theme has an invalid checksum.");
  }
  signal?.throwIfAborted();
  const actualChecksum = [...sha256(packageBytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  if (actualChecksum.toLowerCase() !== expectedChecksum.toLowerCase()) {
    throw new Error("That Open VSX theme failed its integrity check.");
  }
  return packageBytes;
}
