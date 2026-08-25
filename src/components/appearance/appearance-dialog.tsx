import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Download,
  Moon,
  Monitor,
  Paintbrush,
  Plus,
  Search,
  Sun,
  Trash2,
  Upload,
  X,
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
  type AppearanceSettings,
} from "../../lib/theme/appearance";
import {
  EMBER_THEME,
  GROVE_THEME,
  IRIS_THEME,
  OCEAN_THEME,
  T3_CHAT_THEME,
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
  getAppearanceMode,
  getAppearanceSettings,
  getThemeHalves,
  getThemePreference,
  installAndPersistTheme,
  loadCustomThemesIntoMemory,
  refreshAppliedAppearance,
  removeAndPersistTheme,
  replaceAndPersistThemeCollection,
  setAppearanceMode,
  setAppearanceSettings,
  setThemeHalves,
  setThemePreference,
} from "../../lib/settings";
import { toast } from "../../lib/toast";
import { Button, cn } from "../ui";
import { useThemeEditorStore } from "./theme-editor-store";

const BUILT_INS: ReadonlyArray<ThemeDefinition> = [
  T3_CHAT_THEME,
  GROVE_THEME,
  OCEAN_THEME,
  EMBER_THEME,
  IRIS_THEME,
];

const SUGGESTED = ["Dracula", "Catppuccin", "Nord", "Tokyo Night"];

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

export function AppearanceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const customThemes = useCustomThemes();
  const openCreate = useThemeEditorStore((s) => s.openCreate);
  const openEdit = useThemeEditorStore((s) => s.openEdit);

  const [theme, setThemeState] = React.useState<ThemePreference>("light");
  const [mode, setModeState] = React.useState<ThemePreferenceMode>("system");
  const [halves, setHalvesState] = React.useState<ThemeHalves | null>(null);
  const [appearance, setAppearanceState] =
    React.useState<AppearanceSettings>(DEFAULT_APPEARANCE_SETTINGS);
  const [tab, setTab] = React.useState<"themes" | "openvsx" | "controls">("themes");
  const [query, setQuery] = React.useState("");
  const [searching, setSearching] = React.useState(false);
  const [results, setResults] = React.useState<ReadonlyArray<OpenVsxThemeExtension> | null>(null);
  const [installingId, setInstallingId] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    void (async () => {
      await loadCustomThemesIntoMemory();
      setThemeState(await getThemePreference());
      setModeState(await getAppearanceMode());
      setHalvesState(await getThemeHalves());
      setAppearanceState(await getAppearanceSettings());
      setTab("themes");
      setQuery("");
      setResults(null);
    })();
  }, [open]);

  async function selectTheme(next: ThemePreference) {
    setThemeState(next);
    await setThemePreference(next);
    await refreshAppliedAppearance();
  }

  async function updateMode(next: ThemePreferenceMode) {
    setModeState(next);
    await setAppearanceMode(next);
    await refreshAppliedAppearance();
  }

  async function updateHalf(appearanceHalf: "light" | "dark", themeId: string | "") {
    const next: { light?: string; dark?: string } = { ...(halves ?? {}) };
    if (!themeId) delete next[appearanceHalf];
    else next[appearanceHalf] = themeId;
    const cleaned: ThemeHalves | null =
      next.light || next.dark ? next : null;
    setHalvesState(cleaned);
    await setThemeHalves(cleaned);
    await refreshAppliedAppearance();
  }

  async function patchAppearance(patch: Partial<AppearanceSettings>) {
    const next = await setAppearanceSettings(patch);
    setAppearanceState(next);
    await refreshAppliedAppearance();
  }

  async function runSearch(text: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      setResults(null);
      return;
    }
    setSearching(true);
    try {
      setResults(await searchOpenVsxThemes(trimmed));
    } catch (error) {
      setResults([]);
      toast.error("Open VSX search failed", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSearching(false);
    }
  }

  React.useEffect(() => {
    if (tab !== "openvsx") return;
    const handle = window.setTimeout(() => void runSearch(query), 350);
    return () => window.clearTimeout(handle);
  }, [query, tab]);

  async function installExtension(extension: OpenVsxThemeExtension) {
    setInstallingId(extension.id);
    try {
      const themes = await importOpenVsxThemeExtension(extension);
      await replaceAndPersistThemeCollection(extension.collectionId, themes);
      toast.success("Themes installed", {
        description: `${extension.name} · ${themes.length} theme${themes.length === 1 ? "" : "s"}`,
      });
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

  const paletteOptions = [
    ...BUILT_INS,
    ...customThemes,
  ];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/30" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[75] flex max-h-[min(640px,calc(100vh-24px))] w-[min(440px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-surface shadow-xl ring-1 ring-black/10">
          <div className="flex items-center justify-between border-b border-separator px-4 py-3">
            <Dialog.Title className="text-[14px] font-medium">Appearance</Dialog.Title>
            <Dialog.Close asChild>
              <Button iconOnly variant="transparent" size="small" aria-label="Close">
                <X className="size-4" />
              </Button>
            </Dialog.Close>
          </div>

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
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
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
                          mode === id || (id !== "system" && theme === id && mode === "system" && !getThemeDefinition(theme))
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
                    <Button
                      size="small"
                      variant="transparent"
                      onClick={() => {
                        onOpenChange(false);
                        openCreate();
                      }}
                    >
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
                      accept=".json,application/json"
                      multiple
                      className="hidden"
                      onChange={(event) => {
                        void importFiles(event.target.files);
                        event.currentTarget.value = "";
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
                            "flex items-center gap-1 rounded-lg px-2.5 py-1.5",
                            theme === custom.id && "bg-control",
                          )}
                        >
                          <button
                            type="button"
                            className="flex min-w-0 flex-1 items-center gap-2 text-left text-[13px]"
                            onClick={() => void selectTheme(custom.id)}
                          >
                            <ThemeSwatches theme={custom} />
                            <span className="truncate">{custom.label}</span>
                          </button>
                          <Button
                            iconOnly
                            size="small"
                            variant="transparent"
                            aria-label="Edit"
                            onClick={() => {
                              onOpenChange(false);
                              openEdit(custom);
                            }}
                          >
                            <Paintbrush className="size-3.5" />
                          </Button>
                          <Button
                            iconOnly
                            size="small"
                            variant="transparent"
                            aria-label="Remove"
                            onClick={() => {
                              void (async () => {
                                await removeAndPersistTheme(custom.id);
                                if (theme === custom.id) await selectTheme("light");
                                toast.success("Theme removed", { description: custom.label });
                              })();
                            }}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>

                <Section title="Auto mix (halves)">
                  <p className="text-[11px] text-tertiary">
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
                        <option value="">Base theme</option>
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
              <div className="grid gap-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-tertiary" />
                  <input
                    className="h-9 w-full rounded-lg border border-separator bg-transparent pl-8 pr-3 text-[13px] outline-none"
                    placeholder="Search Open VSX themes…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-1">
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
                {searching ? (
                  <p className="text-[12px] text-tertiary">Searching…</p>
                ) : results === null ? (
                  <p className="text-[12px] text-tertiary">Search for a theme pack to install.</p>
                ) : results.length === 0 ? (
                  <p className="text-[12px] text-tertiary">No themes found.</p>
                ) : (
                  <div className="grid gap-2">
                    {results.map((extension) => (
                      <div
                        key={extension.id}
                        className="flex items-start gap-3 rounded-xl border border-separator p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-medium">{extension.name}</div>
                          <div className="truncate text-[11px] text-tertiary">
                            {extension.publisher} · {extension.downloadCount.toLocaleString()} downloads
                          </div>
                        </div>
                        <Button
                          size="small"
                          disabled={installingId === extension.id}
                          onClick={() => void installExtension(extension)}
                        >
                          <Download className="size-3.5" />
                          {installingId === extension.id ? "…" : "Install"}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === "controls" && (
              <div className="grid gap-4">
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
                  <input
                    className="h-8 rounded-lg border border-separator bg-transparent px-2 text-[13px] outline-none"
                    placeholder="Family (empty = system)"
                    value={appearance.fontFamilySans}
                    onChange={(event) => void patchAppearance({ fontFamilySans: event.target.value })}
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
                  <input
                    className="h-8 rounded-lg border border-separator bg-transparent px-2 text-[13px] outline-none"
                    placeholder="Family (empty = SF Mono)"
                    value={appearance.fontFamilyCode}
                    onChange={(event) => void patchAppearance({ fontFamilyCode: event.target.value })}
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
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
