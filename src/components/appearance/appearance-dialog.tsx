import * as React from "react";
import {
  Download,
  Eye,
  Moon,
  Monitor,
  Paintbrush,
  Plus,
  Save,
  Search,
  Shuffle,
  Sun,
  Trash2,
  Upload,
} from "lucide-react";
import {
  DEFAULT_APPEARANCE_SETTINGS,
  MAX_APPEARANCE_CONTRAST,
  MAX_CODE_FONT_SIZE,
  MAX_GLASS_OPACITY,
  MAX_INTERFACE_FONT_SIZE,
  MIN_APPEARANCE_CONTRAST,
  MIN_CODE_FONT_SIZE,
  MIN_GLASS_OPACITY,
  MIN_INTERFACE_FONT_SIZE,
  appearancePresetMatches,
  type AppearancePreset,
  type AppearanceSettings,
} from "../../lib/theme/appearance";
import {
  EMBER_THEME,
  GROVE_THEME,
  IRIS_THEME,
  OCEAN_THEME,
  T3_CHAT_THEME,
  applyThemeColorPreview,
  getCustomThemes,
  getThemeColorsForMode,
  getThemeDefinition,
  parseThemeFile,
  subscribeToCustomThemes,
  type ThemeDefinition,
  type ThemeHalves,
  type ThemePreference,
  type ThemePreferenceMode,
} from "../../lib/theme/palette";
import { parse as parseJsonc } from "jsonc-parser";
import {
  importOpenVsxThemeExtension,
  OPEN_VSX_SEARCH_PAGE_SIZE,
  pickRandomOpenVsxTheme,
  searchOpenVsxThemes,
  type OpenVsxThemeExtension,
} from "../../lib/theme/openVsx";
import {
  isVsCodeThemeFile,
  pairVsCodeThemes,
  parseVsCodeThemeFile,
  resolveThemeLabelCollisions,
} from "../../lib/theme/vscodeImport";
import {
  applyAppearancePreset,
  deleteAppearancePreset,
  getAppearanceMode,
  getAppearancePresets,
  getAppearanceSettings,
  getThemeHalves,
  getThemePreference,
  installAndPersistTheme,
  loadCustomThemesIntoMemory,
  refreshAppliedAppearanceAndBroadcast,
  removeAndPersistTheme,
  replaceAndPersistThemeCollection,
  saveAppearancePreset,
  setAppearanceMode,
  setAppearanceSettings,
  setThemeHalves,
  setThemePreference,
} from "../../lib/settings";
import { toast } from "../../lib/toast";
import { Button, cn } from "../ui";
import { AppearancePreview } from "./appearance-preview";
import { FontFamilySelect } from "./font-family-select";
import { useThemeEditorStore } from "./theme-editor-store";

const BUILT_INS: ReadonlyArray<ThemeDefinition> = [
  T3_CHAT_THEME,
  GROVE_THEME,
  OCEAN_THEME,
  EMBER_THEME,
  IRIS_THEME,
];

const SUGGESTED = ["Dracula", "Catppuccin", "Nord", "Tokyo Night"];

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

function useCustomThemes() {
  return React.useSyncExternalStore(subscribeToCustomThemes, getCustomThemes, () => []);
}

function ThemeSwatches({ theme }: { theme: ThemeDefinition }) {
  const colors = getThemeColorsForMode(theme, theme.appearance) ?? theme.colors;
  return (
    <span className="flex items-center gap-0.5">
      {[colors.canvas, colors.surface, colors.accent, colors.text].map((color, index) => (
        <span
          key={`${theme.id}-${index}`}
          className="size-2.5 rounded-full ring-1 ring-black/10"
          style={{ background: color }}
        />
      ))}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2">
      <h3 className="text-[11px] font-medium uppercase tracking-wide text-tertiary">{title}</h3>
      {children}
    </section>
  );
}

/** Full-window Appearance settings (not clipped by the tray panel). */
export function AppearancePanel() {
  const customThemes = useCustomThemes();
  const openCreate = useThemeEditorStore((s) => s.openCreate);
  const openEdit = useThemeEditorStore((s) => s.openEdit);

  const [theme, setThemeState] = React.useState<ThemePreference>("light");
  const [mode, setModeState] = React.useState<ThemePreferenceMode>("system");
  const [halves, setHalvesState] = React.useState<ThemeHalves | null>(null);
  const [appearance, setAppearanceState] =
    React.useState<AppearanceSettings>(DEFAULT_APPEARANCE_SETTINGS);
  const [presets, setPresets] = React.useState<AppearancePreset[]>([]);
  const [presetName, setPresetName] = React.useState("");
  const [tab, setTab] = React.useState<"themes" | "openvsx" | "controls">("themes");
  const [query, setQuery] = React.useState("");
  const [searching, setSearching] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [results, setResults] = React.useState<ReadonlyArray<OpenVsxThemeExtension> | null>(null);
  const [hasMore, setHasMore] = React.useState(false);
  const [randomPick, setRandomPick] = React.useState<OpenVsxThemeExtension | null>(null);
  const [randomizing, setRandomizing] = React.useState(false);
  const [installingId, setInstallingId] = React.useState<string | null>(null);
  const [previewingId, setPreviewingId] = React.useState<string | null>(null);
  const [previewThemes, setPreviewThemes] = React.useState<ReadonlyArray<ThemeDefinition>>([]);
  const [previewThemeId, setPreviewThemeId] = React.useState<string | null>(null);
  const [previewExtensionName, setPreviewExtensionName] = React.useState<string | null>(null);
  const previewCacheRef = React.useRef(new Map<string, ReadonlyArray<ThemeDefinition>>());
  const previewAbortRef = React.useRef<AbortController | null>(null);
  const randomAbortRef = React.useRef<AbortController | null>(null);
  const searchAbortRef = React.useRef<AbortController | null>(null);
  const seenRandomIdsRef = React.useRef(new Set<string>());
  const nextOffsetRef = React.useRef(0);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    void (async () => {
      await loadCustomThemesIntoMemory();
      setThemeState(await getThemePreference());
      setModeState(await getAppearanceMode());
      setHalvesState(await getThemeHalves());
      setAppearanceState(await getAppearanceSettings());
      setPresets(await getAppearancePresets());
    })();
    return () => {
      previewAbortRef.current?.abort();
      randomAbortRef.current?.abort();
    };
  }, []);

  async function clearOpenVsxPreview() {
    previewAbortRef.current?.abort();
    previewAbortRef.current = null;
    setPreviewingId(null);
    setPreviewThemes([]);
    setPreviewThemeId(null);
    setPreviewExtensionName(null);
    await refreshAppliedAppearanceAndBroadcast();
  }

  function paintPreviewTheme(themeDef: ThemeDefinition) {
    const appearanceMode = themeDef.appearance;
    const colors = getThemeColorsForMode(themeDef, appearanceMode) ?? themeDef.colors;
    applyThemeColorPreview(colors, appearanceMode);
    setPreviewThemeId(themeDef.id);
  }

  async function previewExtension(extension: OpenVsxThemeExtension) {
    previewAbortRef.current?.abort();
    const controller = new AbortController();
    previewAbortRef.current = controller;
    setPreviewingId(extension.id);
    setPreviewExtensionName(extension.name);
    try {
      let themes = previewCacheRef.current.get(extension.id);
      if (!themes) {
        themes = await importOpenVsxThemeExtension(extension, controller.signal);
        if (controller.signal.aborted) return;
        previewCacheRef.current.set(extension.id, themes);
      }
      if (controller.signal.aborted) return;
      setPreviewThemes(themes);
      const preferred =
        themes.find((item) => item.appearance === (mode === "dark" ? "dark" : "light")) ??
        themes[0];
      if (!preferred) throw new Error("No themes in that extension.");
      paintPreviewTheme(preferred);
    } catch (error) {
      if (controller.signal.aborted) return;
      setPreviewThemes([]);
      setPreviewThemeId(null);
      setPreviewExtensionName(null);
      toast.error("Couldn’t preview theme", {
        description: error instanceof Error ? error.message : String(error),
      });
      await refreshAppliedAppearanceAndBroadcast();
    } finally {
      if (previewAbortRef.current === controller) {
        setPreviewingId(null);
        previewAbortRef.current = null;
      }
    }
  }

  async function selectTheme(next: ThemePreference) {
    setThemeState(next);
    await setThemePreference(next);
    await refreshAppliedAppearanceAndBroadcast();
  }

  async function updateMode(next: ThemePreferenceMode) {
    setModeState(next);
    await setAppearanceMode(next);
    await refreshAppliedAppearanceAndBroadcast();
  }

  async function updateHalf(appearanceHalf: "light" | "dark", themeId: string | "") {
    const next: { light?: string; dark?: string } = { ...(halves ?? {}) };
    if (!themeId) delete next[appearanceHalf];
    else next[appearanceHalf] = themeId;
    const cleaned: ThemeHalves | null = next.light || next.dark ? next : null;
    setHalvesState(cleaned);
    await setThemeHalves(cleaned);
    await refreshAppliedAppearanceAndBroadcast();
  }

  async function patchAppearance(patch: Partial<AppearanceSettings>) {
    const next = await setAppearanceSettings(patch);
    setAppearanceState(next);
    await refreshAppliedAppearanceAndBroadcast();
  }

  async function handleSavePreset() {
    const name = presetName.trim();
    if (!name) {
      toast.error("Name required", { description: "Give this configuration a name." });
      return;
    }
    try {
      const saved = await saveAppearancePreset({
        name,
        settings: appearance,
        theme,
        mode,
        halves,
      });
      setPresets(await getAppearancePresets());
      setPresetName("");
      toast.success("Configuration saved", { description: saved.name });
    } catch (error) {
      toast.error("Couldn’t save configuration", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function handleApplyPreset(preset: AppearancePreset) {
    try {
      const applied = await applyAppearancePreset(preset.id);
      setAppearanceState(applied.settings);
      setThemeState(applied.theme);
      setModeState(applied.mode);
      setHalvesState(applied.halves);
      await refreshAppliedAppearanceAndBroadcast();
    } catch (error) {
      toast.error("Couldn’t apply configuration", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function handleDeletePreset(preset: AppearancePreset) {
    try {
      await deleteAppearancePreset(preset.id);
      setPresets(await getAppearancePresets());
    } catch (error) {
      toast.error("Couldn’t delete configuration", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function runSearch(
    text: string,
    { append = false, signal }: { append?: boolean; signal?: AbortSignal } = {},
  ) {
    if (append) setLoadingMore(true);
    else {
      setSearching(true);
      setLoadingMore(false);
      setHasMore(false);
    }
    try {
      let requestedOffset = append ? nextOffsetRef.current : 0;
      let page = await searchOpenVsxThemes(text, {
        signal,
        offset: requestedOffset,
      });
      if (signal?.aborted) return;
      // Open VSX sometimes returns an empty page for a valid offset. Skip ahead
      // a couple of times so "Load more" keeps moving through the catalog.
      let skips = 0;
      while (
        append &&
        page.fetched === 0 &&
        requestedOffset + OPEN_VSX_SEARCH_PAGE_SIZE < page.totalSize &&
        skips < 3 &&
        !signal?.aborted
      ) {
        skips += 1;
        requestedOffset += OPEN_VSX_SEARCH_PAGE_SIZE;
        page = await searchOpenVsxThemes(text, { signal, offset: requestedOffset });
        if (signal?.aborted) return;
      }
      const step = page.fetched > 0 ? page.fetched : OPEN_VSX_SEARCH_PAGE_SIZE;
      nextOffsetRef.current = requestedOffset + step;
      setHasMore(page.totalSize > 0 && nextOffsetRef.current < page.totalSize);
      setResults((current) => {
        if (!append) return page.extensions;
        const seen = new Set((current ?? []).map((item) => item.id));
        return [...(current ?? []), ...page.extensions.filter((item) => !seen.has(item.id))];
      });
    } catch (error) {
      if (isAbortError(error) || signal?.aborted) return;
      if (!append) {
        setResults([]);
        setHasMore(false);
      }
      toast.error("Open VSX search failed", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (!signal?.aborted) {
        setSearching(false);
        setLoadingMore(false);
      }
    }
  }

  React.useEffect(() => {
    if (tab !== "openvsx") return;
    randomAbortRef.current?.abort();
    setRandomPick(null);
    const controller = new AbortController();
    searchAbortRef.current = controller;
    const handle = window.setTimeout(
      () => {
        void runSearch(query, { signal: controller.signal });
      },
      query.trim() ? 350 : 0,
    );
    return () => {
      window.clearTimeout(handle);
      controller.abort();
    };
  }, [query, tab]);

  async function cycleRandomTheme() {
    randomAbortRef.current?.abort();
    const controller = new AbortController();
    randomAbortRef.current = controller;
    setRandomizing(true);
    try {
      const extension = await pickRandomOpenVsxTheme({
        signal: controller.signal,
        excludeIds: seenRandomIdsRef.current,
        fallback: openVsxItems,
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
      previewAbortRef.current?.abort();
      previewAbortRef.current = null;
      setPreviewingId(null);
      setPreviewThemes([]);
      setPreviewThemeId(null);
      setPreviewExtensionName(null);
      previewCacheRef.current.set(extension.id, themes);
      const preferred =
        themes.find((item) => item.appearance === (mode === "dark" ? "dark" : "light")) ??
        themes[0];
      if (preferred) await selectTheme(preferred.id);
      else await refreshAppliedAppearanceAndBroadcast();
      setTab("themes");
    } catch (error) {
      toast.error("Couldn’t install theme", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setInstallingId(null);
    }
  }

  async function importFiles(files: FileList | null) {
    if (!files?.length) return;
    const imported: ThemeDefinition[] = [];
    for (const file of Array.from(files)) {
      try {
        const text = await file.text();
        if (file.size > 256 * 1024) throw new Error("File too large");
        let value: unknown;
        try {
          value = JSON.parse(text);
        } catch {
          value = parseJsonc(text);
        }
        if (isVsCodeThemeFile(value)) {
          imported.push(parseVsCodeThemeFile(value));
        } else {
          imported.push(parseThemeFile(value));
        }
      } catch (error) {
        toast.error(`Couldn’t import ${file.name}`, {
          description: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const paired = resolveThemeLabelCollisions(
      pairVsCodeThemes(imported).map((theme) => ({ theme })),
    );
    for (const theme of paired) {
      await installAndPersistTheme(theme);
    }
    if (paired.length > 0) {
      toast.success("Themes imported", { description: `${paired.length} theme(s)` });
    }
  }

  const paletteOptions = [...BUILT_INS, ...customThemes];
  const listedOpenVsxThemes = results ?? [];
  const openVsxItems =
    randomPick && !listedOpenVsxThemes.some((item) => item.id === randomPick.id)
      ? [randomPick, ...listedOpenVsxThemes]
      : listedOpenVsxThemes;

  return (
    <div className="flex h-full min-h-0 flex-col bg-menu text-ink">
      <div className="flex gap-1 border-b border-separator px-3 py-2">
        {(
          [
            ["themes", "Themes"],
            ["openvsx", "Open VSX"],
            ["controls", "Controls"],
          ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={cn(
                  "rounded-lg px-2.5 py-1 text-[12px]",
                  tab === id ? "bg-control text-ink" : "text-secondary hover:bg-control-subtle",
                )}
                onClick={() => {
                  if (tab === "openvsx" && id !== "openvsx") {
                    randomAbortRef.current?.abort();
                    void clearOpenVsxPreview();
                  }
                  setTab(id);
                }}
              >
                {label}
              </button>
            ))}
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4">
          {tab === "themes" && (
            <div className="grid gap-4">
              <Section title="Mode">
                <div className="grid grid-cols-3 gap-1">
                  {(
                    [
                      ["system", "Auto", Monitor],
                      ["light", "Light", Sun],
                      ["dark", "Dark", Moon],
                    ] as const
                  ).map(([id, label, Icon]) => (
                    <button
                      key={id}
                      type="button"
                      className={cn(
                        "flex items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] ring-1 ring-separator",
                        mode === id ||
                          (id !== "system" &&
                            theme === id &&
                            mode === "system" &&
                            !getThemeDefinition(theme))
                          ? "bg-control"
                          : "bg-transparent",
                      )}
                      onClick={() => {
                        void updateMode(id);
                        if (id !== "system") void selectTheme(id);
                        else if (theme === "light" || theme === "dark") void selectTheme("system");
                      }}
                    >
                      <Icon className="size-3.5" />
                      {label}
                    </button>
                  ))}
                </div>
              </Section>

              <Section title="Built-in">
                <div className="grid gap-1">
                  <button
                    type="button"
                    className={cn(
                      "flex items-center justify-between rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-control-subtle",
                      !getThemeDefinition(theme) && "bg-control",
                    )}
                    onClick={() => {
                      const next = mode === "light" || mode === "dark" ? mode : "system";
                      void selectTheme(next);
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <span className="flex items-center gap-0.5">
                        {["#ffffff", "#fcfcfc", "#138af2", "#000000"].map((color) => (
                          <span
                            key={color}
                            className="size-2.5 rounded-full ring-1 ring-black/10"
                            style={{ background: color }}
                          />
                        ))}
                      </span>
                      Default
                    </span>
                    {!getThemeDefinition(theme) ? "✓" : null}
                  </button>
                  {BUILT_INS.map((builtIn) => (
                    <button
                      key={builtIn.id}
                      type="button"
                      className={cn(
                        "flex items-center justify-between rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-control-subtle",
                        theme === builtIn.id && "bg-control",
                      )}
                      onClick={() => void selectTheme(builtIn.id)}
                    >
                      <span className="flex items-center gap-2">
                        <ThemeSwatches theme={builtIn} />
                        {builtIn.label}
                      </span>
                      {theme === builtIn.id ? "✓" : null}
                    </button>
                  ))}
                </div>
              </Section>

              <Section title="Custom">
                <div className="mb-2 flex gap-2">
                  <Button size="small" variant="transparent" onClick={() => openCreate()}>
                    <Plus className="size-3.5" />
                    Create
                  </Button>
                  <Button
                    size="small"
                    variant="transparent"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="size-3.5" />
                    Import
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,.jsonc,application/json"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      void importFiles(event.target.files);
                      event.target.value = "";
                    }}
                  />
                </div>
                {customThemes.length === 0 ? (
                  <p className="text-[12px] text-tertiary">No custom themes yet.</p>
                ) : (
                  <div className="grid gap-1">
                    {customThemes.map((custom) => (
                      <div
                        key={custom.id}
                        className={cn(
                          "flex items-center gap-1 rounded-lg px-2.5 py-1.5 hover:bg-control-subtle",
                          theme === custom.id && "bg-control",
                        )}
                      >
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-2 text-left text-[13px]"
                          onClick={() => void selectTheme(custom.id)}
                          onDoubleClick={() => openEdit(custom)}
                        >
                          <ThemeSwatches theme={custom} />
                          <span className="truncate">{custom.label}</span>
                        </button>
                        <Button
                          iconOnly
                          size="small"
                          variant="transparent"
                          aria-label={`Edit ${custom.label}`}
                          onClick={() => openEdit(custom)}
                        >
                          <Paintbrush className="size-3.5" />
                        </Button>
                        <Button
                          iconOnly
                          size="small"
                          variant="transparent"
                          aria-label={`Delete ${custom.label}`}
                          onClick={() => void removeAndPersistTheme(custom.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              <Section title="Auto mix (halves)">
                <p className="text-[12px] text-tertiary">
                  When mode is Auto, use different themes for light and dark system appearance.
                </p>
                {(["light", "dark"] as const).map((half) => (
                  <label key={half} className="grid gap-1 text-[12px] text-secondary">
                    {half === "light" ? "Light half" : "Dark half"}
                    <select
                      className="h-8 rounded-lg border border-separator bg-transparent px-2 text-[13px] text-ink"
                      value={halves?.[half] ?? ""}
                      onChange={(event) => void updateHalf(half, event.target.value)}
                    >
                      <option value="">Same as selected theme</option>
                      {paletteOptions.map((option) => (
                        <option key={`${half}-${option.id}`} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </Section>
            </div>
          )}

          {tab === "openvsx" && (
            <div className="grid min-w-0 gap-3 overflow-x-hidden">
              <div className="flex min-w-0 items-center gap-1.5">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-tertiary" />
                  <input
                    className="h-9 w-full min-w-0 rounded-lg border border-separator bg-transparent pl-8 pr-3 text-[13px] outline-none"
                    placeholder="Search Open VSX themes…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
                <Button
                  size="small"
                  variant="transparent"
                  aria-label="Preview a random Open VSX theme"
                  disabled={randomizing}
                  className="h-9 shrink-0 px-2.5"
                  onClick={() => void cycleRandomTheme()}
                >
                  <Shuffle className="size-3.5" />
                  {randomizing ? "Picking…" : "Random"}
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="rounded-full bg-control-subtle px-2.5 py-1 text-[11px] text-secondary"
                    onClick={() => setQuery(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
              {previewThemes.length > 1 ? (
                <label className="grid min-w-0 gap-1 text-[12px] text-secondary">
                  Preview variant
                  <select
                    className="h-8 w-full min-w-0 rounded-lg border border-separator bg-transparent px-2 text-[13px] text-ink"
                    value={previewThemeId ?? ""}
                    onChange={(event) => {
                      const next = previewThemes.find((item) => item.id === event.target.value);
                      if (next) paintPreviewTheme(next);
                    }}
                  >
                    {previewThemes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                        {item.appearance ? ` (${item.appearance})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {openVsxItems.length === 0 && (results === null || (searching && !loadingMore)) ? (
                <p className="text-[12px] text-tertiary">
                  {query.trim() ? "Searching…" : "Loading themes…"}
                </p>
              ) : openVsxItems.length === 0 ? (
                <p className="text-[12px] text-tertiary">No themes found.</p>
              ) : (
                <div className="grid min-w-0 gap-1">
                  {openVsxItems.map((extension) => {
                    const isPreviewing = previewingId === extension.id;
                    const isActivePreview =
                      previewExtensionName === extension.name && previewThemes.length > 0;
                    return (
                      <div
                        key={extension.id}
                        className={cn(
                          "flex min-w-0 items-start justify-between gap-2 rounded-lg px-2.5 py-2 hover:bg-control-subtle",
                          isActivePreview && "bg-control",
                        )}
                      >
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <div className="break-words text-[13px] font-medium [overflow-wrap:anywhere]">
                            {extension.name}
                          </div>
                          <div className="break-words text-[11px] text-tertiary [overflow-wrap:anywhere]">
                            {extension.publisher} · {extension.downloadCount.toLocaleString()}{" "}
                            downloads
                            {extension.description ? ` · ${extension.description}` : ""}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            iconOnly
                            size="small"
                            variant="transparent"
                            aria-label={`Preview ${extension.name}`}
                            disabled={isPreviewing || installingId === extension.id}
                            onClick={() => void previewExtension(extension)}
                          >
                            {isPreviewing ? (
                              <span className="text-[11px]">…</span>
                            ) : (
                              <Eye className="size-3.5" />
                            )}
                          </Button>
                          <Button
                            size="small"
                            variant="filled"
                            disabled={installingId === extension.id}
                            onClick={() => void installExtension(extension)}
                          >
                            <Download className="size-3.5" />
                            {installingId === extension.id ? "…" : "Install"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  {hasMore ? (
                    <Button
                      variant="transparent"
                      className="justify-center"
                      disabled={loadingMore || searching}
                      onClick={() =>
                        void runSearch(query, {
                          append: true,
                          signal: searchAbortRef.current?.signal,
                        })
                      }
                    >
                      {loadingMore ? "Loading…" : "Load more"}
                    </Button>
                  ) : null}
                </div>
              )}
            </div>
          )}

          {tab === "controls" && (
            <div className="grid gap-4">
              <Section title="Configurations">
                <p className="text-[12px] text-tertiary">
                  Save the current theme, mode, and control settings, then click a name to restore
                  it later.
                </p>
                <div className="flex gap-1.5">
                  <input
                    className="h-8 min-w-0 flex-1 rounded-lg border border-separator bg-transparent px-2 text-[13px] outline-none"
                    placeholder="Configuration name…"
                    value={presetName}
                    onChange={(event) => setPresetName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void handleSavePreset();
                      }
                    }}
                  />
                  <Button size="small" variant="filled" onClick={() => void handleSavePreset()}>
                    <Save className="size-3.5" />
                    Save configuration
                  </Button>
                </div>
                {presets.length === 0 ? (
                  <p className="text-[12px] text-tertiary">No saved configurations yet.</p>
                ) : (
                  <div className="grid gap-1">
                    {presets.map((preset) => {
                      const active = appearancePresetMatches(preset, {
                        settings: appearance,
                        theme,
                        mode,
                      });
                      return (
                        <div
                          key={preset.id}
                          className={cn(
                            "flex items-center gap-1 rounded-lg px-2.5 py-1.5 hover:bg-control-subtle",
                            active && "bg-control",
                          )}
                        >
                          <button
                            type="button"
                            className="min-w-0 flex-1 truncate text-left text-[13px]"
                            onClick={() => void handleApplyPreset(preset)}
                          >
                            {preset.name}
                            {active ? (
                              <span className="ml-1.5 text-[11px] text-tertiary">active</span>
                            ) : null}
                          </button>
                          <Button
                            iconOnly
                            size="small"
                            variant="transparent"
                            aria-label={`Delete ${preset.name}`}
                            onClick={() => void handleDeletePreset(preset)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Section>
              <Section title="Contrast">
                <div className="flex items-center justify-between text-[12px] text-secondary">
                  <span>Interface contrast</span>
                  <span className="tabular-nums">{appearance.appearanceContrast}%</span>
                </div>
                <input
                  type="range"
                  min={MIN_APPEARANCE_CONTRAST}
                  max={MAX_APPEARANCE_CONTRAST}
                  value={appearance.appearanceContrast}
                  onChange={(event) =>
                    void patchAppearance({ appearanceContrast: Number(event.target.value) })
                  }
                />
              </Section>
              <Section title="Glass">
                <div className="flex items-center justify-between text-[12px] text-secondary">
                  <span>Glass opacity</span>
                  <span className="tabular-nums">{appearance.glassOpacity}%</span>
                </div>
                <input
                  type="range"
                  min={MIN_GLASS_OPACITY}
                  max={MAX_GLASS_OPACITY}
                  value={appearance.glassOpacity}
                  onChange={(event) =>
                    void patchAppearance({ glassOpacity: Number(event.target.value) })
                  }
                />
              </Section>
              <Section title="Interface font">
                <FontFamilySelect
                  value={appearance.fontFamilySans}
                  onValueChange={(fontFamilySans) => void patchAppearance({ fontFamilySans })}
                />
                <div className="flex items-center justify-between text-[12px] text-secondary">
                  <span>Size</span>
                  <span className="tabular-nums">{appearance.fontSizeInterface}px</span>
                </div>
                <input
                  type="range"
                  min={MIN_INTERFACE_FONT_SIZE}
                  max={MAX_INTERFACE_FONT_SIZE}
                  value={appearance.fontSizeInterface}
                  onChange={(event) =>
                    void patchAppearance({ fontSizeInterface: Number(event.target.value) })
                  }
                />
              </Section>
              <Section title="Code / mono font">
                <FontFamilySelect
                  kind="mono"
                  value={appearance.fontFamilyCode}
                  onValueChange={(fontFamilyCode) => void patchAppearance({ fontFamilyCode })}
                />
                <div className="flex items-center justify-between text-[12px] text-secondary">
                  <span>Size</span>
                  <span className="tabular-nums">{appearance.fontSizeCode}px</span>
                </div>
                <input
                  type="range"
                  min={MIN_CODE_FONT_SIZE}
                  max={MAX_CODE_FONT_SIZE}
                  value={appearance.fontSizeCode}
                  onChange={(event) =>
                    void patchAppearance({ fontSizeCode: Number(event.target.value) })
                  }
                />
              </Section>
              <Section title="Smoothing">
                <label className="flex items-center justify-between text-[13px]">
                  Antialiased font smoothing
                  <input
                    type="checkbox"
                    checked={appearance.fontSmoothing}
                    onChange={(event) =>
                      void patchAppearance({ fontSmoothing: event.target.checked })
                    }
                  />
                </label>
              </Section>
              <Button
                variant="transparent"
                className="justify-center"
                onClick={() => void patchAppearance({ ...DEFAULT_APPEARANCE_SETTINGS })}
              >
                Reset to defaults
              </Button>
            </div>
          )}
        </div>
        <AppearancePreview
          loading={previewingId !== null}
          caption={
            previewThemeId
              ? (() => {
                  const active = previewThemes.find((item) => item.id === previewThemeId);
                  if (!active) return previewExtensionName;
                  return previewExtensionName
                    ? `${previewExtensionName} · ${active.label}`
                    : active.label;
                })()
              : null
          }
        />
      </div>
    </div>
  );
}
