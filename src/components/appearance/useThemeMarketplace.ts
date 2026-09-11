/** Open VSX marketplace workflow: search, pagination, request identity,
 *  preview, random pick, and install — all off-component so the panel only
 *  renders results. */

import * as React from "react";

import { toast } from "../ui/toast";
import {
  refreshAppliedAppearanceAndBroadcast,
  themePreview,
  type ThemePreviewSession,
} from "../../lib/theme/controller";
import {
  OPEN_VSX_SEARCH_PAGE_SIZE,
  pickRandomOpenVsxTheme,
  searchOpenVsxThemes,
  type OpenVsxThemeExtension,
  type OpenVsxThemeSearchPage,
} from "../../lib/theme/open-vsx/client";
import { importOpenVsxThemeExtension } from "../../lib/theme/open-vsx/import";
import { getThemeSpecForMode } from "../../lib/theme/source-types";
import { replaceAndPersistThemeCollection } from "../../lib/settings/index";
import type { ThemeDefinition } from "../../lib/theme/types";
import { useAppearanceStore } from "../../state/appearance";

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

export interface OpenVsxSearchState {
  searching: boolean;
  loadingMore: boolean;
  results: ReadonlyArray<OpenVsxThemeExtension> | null;
  hasMore: boolean;
}

type Searcher = (
  query: string,
  options: { signal?: AbortSignal; offset?: number },
) => Promise<OpenVsxThemeSearchPage>;

const EMPTY_SEARCH_STATE: OpenVsxSearchState = {
  searching: false,
  loadingMore: false,
  results: null,
  hasMore: false,
};

/**
 * Search request flow independent of React. A new query supersedes the
 * in-flight one: its signal aborts, and a superseded response can never
 * append into the new query's pages. Empty page results are skipped ahead
 * so "Load more" keeps moving through the catalog.
 */
export class OpenVsxSearchFlow {
  state: OpenVsxSearchState = EMPTY_SEARCH_STATE;

  private controller: AbortController | null = null;
  private nextOffset = 0;
  private listeners = new Set<() => void>();

  constructor(
    private readonly search: Searcher = searchOpenVsxThemes,
    private readonly onError?: (error: unknown) => void,
    private readonly pageSize: number = OPEN_VSX_SEARCH_PAGE_SIZE,
  ) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<OpenVsxSearchState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  /** Start a new query generation. Aborts the in-flight request and resets
   *  pagination. Returns the signal the caller must pass to `run`. */
  beginNewSearch(): AbortSignal {
    this.controller?.abort();
    this.controller = new AbortController();
    this.nextOffset = 0;
    return this.controller.signal;
  }

  /** Abort whatever is in flight (unmount or leaving the tab). */
  cancel(): void {
    this.controller?.abort();
  }

  async run(
    query: string,
    { append = false, signal }: { append?: boolean; signal?: AbortSignal } = {},
  ): Promise<void> {
    if (append) this.set({ loadingMore: true });
    else this.set({ searching: true, loadingMore: false, hasMore: false });
    try {
      let requestedOffset = append ? this.nextOffset : 0;
      let page = await this.search(query, { signal, offset: requestedOffset });
      if (signal?.aborted) return;
      // Open VSX sometimes returns an empty page for a valid offset. Skip
      // ahead a couple of times so "Load more" keeps moving.
      let skips = 0;
      while (
        append &&
        page.fetched === 0 &&
        requestedOffset + this.pageSize < page.totalSize &&
        skips < 3 &&
        !signal?.aborted
      ) {
        skips += 1;
        requestedOffset += this.pageSize;
        page = await this.search(query, { signal, offset: requestedOffset });
        if (signal?.aborted) return;
      }
      const step = page.fetched > 0 ? page.fetched : this.pageSize;
      this.nextOffset = requestedOffset + step;
      const hasMore = page.totalSize > 0 && this.nextOffset < page.totalSize;
      const results = append
        ? [
            ...(this.state.results ?? []),
            ...page.extensions.filter(
              (item) => !new Set((this.state.results ?? []).map((x) => x.id)).has(item.id),
            ),
          ]
        : page.extensions;
      this.set({ hasMore, results });
    } catch (error) {
      if (isAbortError(error) || signal?.aborted) return;
      if (!append) this.set({ results: [], hasMore: false });
      this.onError?.(error);
    } finally {
      if (!signal?.aborted) this.set({ searching: false, loadingMore: false });
    }
  }

  loadMore(query: string): Promise<void> {
    return this.run(query, { append: true, signal: this.controller?.signal });
  }
}

export interface ThemeMarketplace {
  query: string;
  setQuery(query: string): void;
  searching: boolean;
  loadingMore: boolean;
  results: ReadonlyArray<OpenVsxThemeExtension> | null;
  hasMore: boolean;
  items: ReadonlyArray<OpenVsxThemeExtension>;
  randomizing: boolean;
  installingId: string | null;
  previewingId: string | null;
  previewThemes: ReadonlyArray<ThemeDefinition>;
  previewThemeId: string | null;
  previewExtensionName: string | null;
  loadMore(): void;
  cycleRandomTheme(): void;
  previewExtension(extension: OpenVsxThemeExtension): void;
  selectPreviewVariant(themeId: string): void;
  installExtension(extension: OpenVsxThemeExtension): void;
  /** End the marketplace preview and restore the persisted appearance —
   *  used when leaving the marketplace tab. */
  dismissPreview(): void;
}

export function useThemeMarketplace(options: {
  /** Whether the marketplace tab is on screen. */
  active: boolean;
  /** Preferred variant when an extension ships several themes. */
  preferredAppearance: "light" | "dark";
  /** Called after a successful install — the panel switches to Themes. */
  onInstalled?: () => void;
}): ThemeMarketplace {
  const { active, preferredAppearance, onInstalled } = options;
  const selectTheme = useAppearanceStore((s) => s.selectTheme);

  const [query, setQuery] = React.useState("");
  const [randomPick, setRandomPick] = React.useState<OpenVsxThemeExtension | null>(null);
  const [randomizing, setRandomizing] = React.useState(false);
  const [installingId, setInstallingId] = React.useState<string | null>(null);
  const [previewingId, setPreviewingId] = React.useState<string | null>(null);
  const [previewThemes, setPreviewThemes] = React.useState<ReadonlyArray<ThemeDefinition>>([]);
  const [previewThemeId, setPreviewThemeId] = React.useState<string | null>(null);
  const [previewExtensionName, setPreviewExtensionName] = React.useState<string | null>(null);

  const previewCacheRef = React.useRef(new Map<string, ReadonlyArray<ThemeDefinition>>());
  const previewSessionRef = React.useRef<ThemePreviewSession | null>(null);
  const randomAbortRef = React.useRef<AbortController | null>(null);
  const seenRandomIdsRef = React.useRef(new Set<string>());

  const flowRef = React.useRef<OpenVsxSearchFlow | null>(null);
  if (!flowRef.current) {
    flowRef.current = new OpenVsxSearchFlow(undefined, (error) => {
      toast.error("Open VSX search failed", {
        description: error instanceof Error ? error.message : String(error),
      });
    });
  }
  const flow = flowRef.current;
  const [searchState, setSearchState] = React.useState<OpenVsxSearchState>(flow.state);
  React.useEffect(() => flow.subscribe(() => setSearchState(flow.state)), [flow]);

  // Debounced search: a new query supersedes the in-flight one, and
  // deactivation aborts the page load entirely.
  React.useEffect(() => {
    if (!active) return;
    randomAbortRef.current?.abort();
    setRandomPick(null);
    const signal = flow.beginNewSearch();
    const handle = window.setTimeout(
      () => {
        void flow.run(query, { signal });
      },
      query.trim() ? 350 : 0,
    );
    return () => {
      window.clearTimeout(handle);
      flow.cancel();
    };
  }, [query, active, flow]);

  // Releasing the hook releases owned preview work; a late completion can
  // never repaint because the session is ended.
  React.useEffect(() => {
    return () => {
      randomAbortRef.current?.abort();
      const session = previewSessionRef.current;
      previewSessionRef.current = null;
      void session?.end();
      flow.cancel();
    };
  }, [flow]);

  function paintPreviewTheme(themeDef: ThemeDefinition) {
    const session = previewSessionRef.current;
    if (session?.isActive()) {
      // Paint the preferred mode when the theme has one; else its base mode.
      const source =
        getThemeSpecForMode(themeDef, preferredAppearance) ??
        themeDef.modes[themeDef.appearance]!;
      const appearance = getThemeSpecForMode(themeDef, preferredAppearance)
        ? preferredAppearance
        : themeDef.appearance;
      session.show({ source, appearance });
    }
    setPreviewThemeId(themeDef.id);
  }

  async function previewExtension(extension: OpenVsxThemeExtension) {
    const session = themePreview.begin();
    previewSessionRef.current = session;
    setPreviewingId(extension.id);
    setPreviewExtensionName(extension.name);
    try {
      let themes = previewCacheRef.current.get(extension.id);
      if (!themes) {
        themes = await importOpenVsxThemeExtension(extension, session.signal);
        if (session.signal.aborted) return;
        previewCacheRef.current.set(extension.id, themes);
      }
      if (!session.isActive()) return;
      setPreviewThemes(themes);
      const preferred =
        themes.find((item) => item.appearance === preferredAppearance) ?? themes[0];
      if (!preferred) throw new Error("No themes in that extension.");
      paintPreviewTheme(preferred);
    } catch (error) {
      if (session.signal.aborted || !session.isActive()) return;
      setPreviewThemes([]);
      setPreviewThemeId(null);
      setPreviewExtensionName(null);
      toast.error("Couldn’t preview theme", {
        description: error instanceof Error ? error.message : String(error),
      });
      if (previewSessionRef.current === session) previewSessionRef.current = null;
      await session.end({ restore: true });
    } finally {
      // Only the latest preview request clears its own spinner.
      if (previewSessionRef.current === session) setPreviewingId(null);
    }
  }

  async function cycleRandomTheme() {
    randomAbortRef.current?.abort();
    const controller = new AbortController();
    randomAbortRef.current = controller;
    setRandomizing(true);
    try {
      const extension = await pickRandomOpenVsxTheme({
        signal: controller.signal,
        excludeIds: seenRandomIdsRef.current,
        fallback: items,
      });
      if (controller.signal.aborted) return;
      seenRandomIdsRef.current.add(extension.id);
      setRandomPick(extension);
      await previewExtension(extension);
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) return;
      toast.error("Couldn’t pick a random theme", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (randomAbortRef.current === controller) {
        setRandomizing(false);
        randomAbortRef.current = null;
      }
    }
  }

  async function installExtension(extension: OpenVsxThemeExtension) {
    setInstallingId(extension.id);
    try {
      const themes = await importOpenVsxThemeExtension(extension);
      await replaceAndPersistThemeCollection(extension.collectionId, themes);
      toast.success("Themes installed", {
        description: `${extension.name} · ${themes.length} theme${themes.length === 1 ? "" : "s"}`,
      });
      const session = previewSessionRef.current;
      previewSessionRef.current = null;
      setPreviewingId(null);
      setPreviewThemes([]);
      setPreviewThemeId(null);
      setPreviewExtensionName(null);
      // The freshly installed selection repaints next; no restore needed.
      void session?.end();
      previewCacheRef.current.set(extension.id, themes);
      const preferred =
        themes.find((item) => item.appearance === preferredAppearance) ?? themes[0];
      if (preferred) await selectTheme(preferred.id);
      else await refreshAppliedAppearanceAndBroadcast();
      onInstalled?.();
    } catch (error) {
      toast.error("Couldn’t install theme", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setInstallingId(null);
    }
  }

  function dismissPreview() {
    randomAbortRef.current?.abort();
    const session = previewSessionRef.current;
    previewSessionRef.current = null;
    setPreviewingId(null);
    setPreviewThemes([]);
    setPreviewThemeId(null);
    setPreviewExtensionName(null);
    if (session) void session.end({ restore: true });
    else void refreshAppliedAppearanceAndBroadcast();
  }

  const results = searchState.results;
  const items =
    randomPick && !(results ?? []).some((item) => item.id === randomPick.id)
      ? [randomPick, ...(results ?? [])]
      : (results ?? []);

  return {
    query,
    setQuery,
    searching: searchState.searching,
    loadingMore: searchState.loadingMore,
    results,
    hasMore: searchState.hasMore,
    items,
    randomizing,
    installingId,
    previewingId,
    previewThemes,
    previewThemeId,
    previewExtensionName,
    loadMore: () => void flow.loadMore(query),
    cycleRandomTheme: () => void cycleRandomTheme(),
    previewExtension: (extension) => void previewExtension(extension),
    selectPreviewVariant: (themeId) => {
      const next = previewThemes.find((item) => item.id === themeId);
      if (next) paintPreviewTheme(next);
    },
    installExtension: (extension) => void installExtension(extension),
    dismissPreview,
  };
}
