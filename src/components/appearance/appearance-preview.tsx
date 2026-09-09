import type { CSSProperties } from "react";
import { RefreshCw, Settings } from "lucide-react";
import {
  getThemeColorVariable,
  isThemeColor,
  THEME_COLOR_ROLES,
  type ThemeColors,
} from "../../lib/theme/palette";
import { cn } from "../ui";

function cssVarsForThemeColors(colors: ThemeColors): CSSProperties {
  const vars: Record<string, string> = {};
  for (const role of THEME_COLOR_ROLES) {
    const value = colors[role];
    if (isThemeColor(value)) vars[getThemeColorVariable(role)] = value;
  }
  return vars as CSSProperties;
}

type MockBar = {
  label: string;
  pct: number;
  caption?: string;
};

type MockCard = {
  provider: string;
  providerTone: "orange" | "blue" | "green";
  label: string;
  plan: string;
  bars: ReadonlyArray<MockBar>;
};

const MOCK_CARDS: ReadonlyArray<MockCard> = [
  {
    provider: "Claude",
    providerTone: "orange",
    label: "Work",
    plan: "Max",
    bars: [
      { label: "Current session", pct: 42, caption: "resets in 4 hr" },
      { label: "Weekly · All models", pct: 71 },
      { label: "Extra usage", pct: 18 },
    ],
  },
  {
    provider: "Cursor",
    providerTone: "blue",
    label: "Personal",
    plan: "Pro",
    bars: [
      { label: "Cursor Models", pct: 58 },
      { label: "Other Models", pct: 93, caption: "resets in 2d" },
      { label: "Grok Bot", pct: 12 },
    ],
  },
];

const PROVIDER_TONES: Record<MockCard["providerTone"], string> = {
  orange: "bg-support-orange/10 text-support-orange",
  blue: "bg-support-blue/10 text-support-blue",
  green: "bg-support-green/10 text-support-green",
};

function barFill(pct: number): string {
  if (pct >= 90) return "var(--support-red)";
  if (pct >= 75) return "var(--support-orange)";
  if (pct >= 50) return "var(--support-yellow)";
  return "var(--support-green)";
}

/**
 * Miniature usage-monitor shell. Reads live theme / font / glass CSS vars from
 * the document so Appearance tweaks show up immediately without mirroring state.
 * Pass `colors` to bind a draft palette onto this shell instead of :root.
 */
export function UsageMonitorPreview({
  className,
  colors,
}: {
  className?: string;
  colors?: ThemeColors;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-[14px] shadow-[0_8px_24px_rgb(0_0_0/0.12)] ring-1 ring-black/8",
        colors && "theme-preview-shell",
        className,
      )}
      style={{
        background: "var(--page-plane)",
        color: "var(--text-primary)",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--font-size-interface)",
        WebkitFontSmoothing: "inherit",
        ...(colors ? cssVarsForThemeColors(colors) : null),
      }}
    >
      <div className="flex items-center justify-between gap-2 px-2.5 pb-1.5 pt-2">
        <span className="truncate text-[12px] font-medium leading-none tracking-tight">
          AI Usage
        </span>
        <div className="flex items-center gap-1">
          <span
            className="glass-button flex size-5 items-center justify-center rounded-full"
            style={{ fontSize: 0 }}
          >
            <RefreshCw className="size-2.5 opacity-70" />
          </span>
          <span
            className="glass-button flex size-5 items-center justify-center rounded-full"
            style={{ fontSize: 0 }}
          >
            <Settings className="size-2.5 opacity-70" />
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-2 pb-2.5">
        {MOCK_CARDS.map((card) => (
          <div
            key={`${card.provider}-${card.label}`}
            className="flex min-w-0 flex-col gap-2 rounded-[12px] border border-separator bg-surface p-2"
          >
            <div className="flex min-w-0 items-center gap-1.5">
              <span
                className={cn(
                  "inline-flex shrink-0 items-center rounded-full px-1.5 py-px text-[9px] font-medium leading-none",
                  PROVIDER_TONES[card.providerTone],
                )}
              >
                {card.provider}
              </span>
              <span className="min-w-0 truncate text-[11px] font-medium leading-none">
                {card.label}
              </span>
              <span className="min-w-0 truncate text-[9px] leading-none text-tertiary">
                · {card.plan}
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              {card.bars.map((bar) => (
                <div key={bar.label} className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-[9px] leading-none text-secondary">
                      {bar.label}
                    </span>
                    <span className="shrink-0 text-[9px] font-medium leading-none tabular-nums">
                      {bar.pct}%
                    </span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-control-subtle">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${bar.pct}%`, background: barFill(bar.pct) }}
                    />
                  </div>
                  {bar.caption ? (
                    <span className="truncate text-[8px] leading-none text-tertiary">
                      {bar.caption}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>

            <span className="pt-0.5 text-[8px] leading-none text-quaternary">
              updated just now
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AppearancePreview({
  className,
  caption,
  loading,
}: {
  className?: string;
  caption?: string | null;
  loading?: boolean;
}) {
  return (
    <aside
      aria-hidden
      className={cn(
        "flex w-[260px] shrink-0 flex-col border-l border-separator bg-control-subtle/40 p-3",
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[10px] font-medium uppercase tracking-wide text-tertiary">Preview</div>
        {loading ? (
          <div className="text-[10px] text-tertiary">Loading…</div>
        ) : caption ? (
          <div className="min-w-0 truncate text-[10px] text-tertiary" title={caption}>
            {caption}
          </div>
        ) : null}
      </div>
      <UsageMonitorPreview className="flex-1" />
    </aside>
  );
}
