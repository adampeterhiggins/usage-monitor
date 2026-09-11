/** Open VSX marketplace tab: search box, suggestions, result rows with
 *  preview/install actions, and "load more" pagination. All workflow state
 *  lives in `useThemeMarketplace`. */

import { Download, Eye, Search, Shuffle } from "lucide-react";

import { Button, cn } from "../ui";
import type { ThemeMarketplace as ThemeMarketplaceState } from "./use-theme-marketplace";

const SUGGESTED = ["Dracula", "Catppuccin", "Nord", "Tokyo Night"];

export function ThemeMarketplace({ marketplace }: { marketplace: ThemeMarketplaceState }) {
  const {
    query,
    setQuery,
    searching,
    loadingMore,
    results,
    hasMore,
    items,
    randomizing,
    installingId,
    previewingId,
    previewThemes,
    previewThemeId,
    previewExtensionName,
  } = marketplace;

  return (
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
          onClick={() => marketplace.cycleRandomTheme()}
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
            onChange={(event) => marketplace.selectPreviewVariant(event.target.value)}
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
      {items.length === 0 && (results === null || (searching && !loadingMore)) ? (
        <p className="text-[12px] text-tertiary">
          {query.trim() ? "Searching…" : "Loading themes…"}
        </p>
      ) : items.length === 0 ? (
        <p className="text-[12px] text-tertiary">No themes found.</p>
      ) : (
        <div className="grid min-w-0 gap-1">
          {items.map((extension) => {
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
                    onClick={() => marketplace.previewExtension(extension)}
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
                    onClick={() => marketplace.installExtension(extension)}
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
              onClick={() => marketplace.loadMore()}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
