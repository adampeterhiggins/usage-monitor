import type { CSSProperties, ReactNode } from "react";
import { RefreshCw, Settings } from "lucide-react";
import type { ResolvedUiPalette } from "../../lib/theme/resolve-ui-palette";
import { paletteToCssVariables } from "../../lib/theme/ui-palette-css";
import { severityFillClass, severityStrokeClass } from "../../lib/usage/presentation";
import { cn } from "../../lib/utils";

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
  orange: "text-ui-provider-orange-fg",
  blue: "text-ui-provider-blue-fg",
  green: "text-ui-provider-green-fg",
};

const PROVIDER_TONE_BACKGROUND: Record<MockCard["providerTone"], string> = {
  orange: "var(--local-provider-orange-background)",
  blue: "var(--local-provider-blue-background)",
  green: "var(--local-provider-green-background)",
};

const PROVIDER_TONE_TINT: Record<MockCard["providerTone"], string> = {
  orange: "var(--form-card-tint-orange, var(--form-card-background))",
  blue: "var(--form-card-tint-blue, var(--form-card-background))",
  green: "var(--form-card-tint-green, var(--form-card-background))",
};

/** This shell is a miniature, so identity sizes are taken down proportionally
 *  rather than used raw — a Bold 11px meter would swamp a 190px rail. Shape
 *  and type tokens (radius, notching, case, tracking, family) pass through
 *  untouched, because those are what an identity actually reads as.
 *
 *  Only single-value tokens are scaled: `card-padding` can be a shorthand
 *  (`14px 4px`), which calc() cannot multiply, so the miniature keeps its own
 *  padding. */
const scaled = (token: string, factor: number) => `calc(var(${token}) * ${factor})`;

const PREVIEW_FORM = {
  cardRadius: scaled("--form-card-radius", 0.7),
  meterHeight: scaled("--form-meter-height", 0.5),
  labelSize: scaled("--form-label-size", 0.75),
  valueSize: scaled("--form-value-size", 0.72),
  captionSize: scaled("--form-caption-size", 0.8),
  accountSize: scaled("--form-account-size", 0.82),
  ringSize: scaled("--form-meter-ring-size", 0.42),
} as const;

const RING_CIRCUMFERENCE = 2 * Math.PI * 22;

/**
 * Miniature usage-monitor shell built from the same semantic utilities and
 * surface contexts as production. Pass a resolved `palette` to bind a draft
 * onto this shell; otherwise it reads the live document variables (which the
 * theme layer already painted), so Appearance tweaks show up immediately.
 */
/** Desktop-like wash so panel translucency is visible in the miniature.
 *  Production paints over the real wallpaper; this is preview chrome only. */
export function PreviewBackdrop({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("relative min-h-0 overflow-hidden rounded-[14px]", className)}>
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, #5f7d9b 0%, #c4a574 46%, #7d8f62 100%)",
        }}
      />
      <div className="relative flex h-full min-h-0 flex-col">{children}</div>
    </div>
  );
}

export function UsageMonitorPreview({
  className,
  palette,
}: {
  className?: string;
  palette?: ResolvedUiPalette | null;
}) {
  return (
    <div
      aria-hidden
      data-ui-surface="canvas"
      data-ui-stock={palette ? String(palette.stock) : undefined}
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-[14px] shadow-menu ring-1 ring-ui-subtle",
        className,
      )}
      style={{
        background: "color-mix(in srgb, var(--ui-panel-tint) calc(var(--ui-panel-opacity) * 100%), transparent)",
        color: "var(--ui-canvas-text-primary)",
        fontFamily: "var(--form-font-family)",
        fontSize: "var(--font-size-interface)",
        WebkitFontSmoothing: "inherit",
        colorScheme: palette?.appearance,
        ...(palette ? (paletteToCssVariables(palette) as CSSProperties) : null),
      }}
    >
      <div
        data-ui-surface="toolbar"
        className="ui-toolbar flex items-center justify-between gap-2 px-2.5 pb-1.5 pt-2"
        style={{ color: "var(--local-text-primary)" }}
      >
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

      <div className="relative flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-2 pb-2.5">
        {MOCK_CARDS.map((card) => (
          <div
            key={`${card.provider}-${card.label}`}
            data-ui-surface="card"
            className="ui-surface flex min-w-0 flex-col gap-2 border-solid p-2"
            style={{
              background: PROVIDER_TONE_TINT[card.providerTone],
              borderRadius: PREVIEW_FORM.cardRadius,
              borderWidth: "var(--form-card-border-width)",
              borderColor: "var(--form-card-border-color)",
              boxShadow: "var(--form-card-shadow)",
            }}
          >
            <div className="flex min-w-0 items-center gap-1.5">
              <span
                className={cn(
                  "inline-flex shrink-0 items-center px-1.5 py-px text-[9px] leading-none",
                  PROVIDER_TONES[card.providerTone],
                )}
                style={{
                  background: `var(--form-badge-background, ${PROVIDER_TONE_BACKGROUND[card.providerTone]})`,
                  borderRadius: "var(--form-badge-radius)",
                  textTransform: "var(--form-badge-transform)" as CSSProperties["textTransform"],
                  letterSpacing: "var(--form-badge-tracking)",
                  fontWeight: "var(--form-badge-weight)" as CSSProperties["fontWeight"],
                }}
              >
                {card.provider}
              </span>
              <span
                className="min-w-0 truncate leading-none"
                style={{
                  fontSize: PREVIEW_FORM.accountSize,
                  fontWeight: "var(--form-account-weight)" as CSSProperties["fontWeight"],
                }}
              >
                {card.label}
              </span>
              <span
                className="min-w-0 truncate leading-none text-ui-tertiary"
                style={{ fontSize: PREVIEW_FORM.captionSize }}
              >
                · {card.plan}
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              {card.bars.map((bar) => (
                <div key={bar.label} className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className="min-w-0 truncate leading-none text-ui-secondary"
                      style={{
                        fontSize: PREVIEW_FORM.labelSize,
                        fontWeight: "var(--form-label-weight)" as CSSProperties["fontWeight"],
                        textTransform: "var(--form-label-transform)" as CSSProperties["textTransform"],
                        letterSpacing: "var(--form-label-tracking)",
                      }}
                    >
                      {bar.label}
                    </span>
                    <span
                      className="shrink-0 leading-none tabular-nums"
                      style={{
                        fontSize: PREVIEW_FORM.valueSize,
                        fontWeight: "var(--form-value-weight)" as CSSProperties["fontWeight"],
                        display: "var(--form-value-display)",
                      }}
                    >
                      {bar.pct}%
                    </span>
                  </div>
                  <div
                    className="w-full overflow-hidden bg-ui-track [display:var(--form-meter-bar-display)]"
                    style={{
                      height: PREVIEW_FORM.meterHeight,
                      borderRadius: "var(--form-meter-radius)",
                    }}
                  >
                    <div
                      className={cn(
                        "relative h-full rounded-[inherit]",
                        "after:absolute after:inset-0 after:[background-image:var(--form-meter-notch)]",
                        severityFillClass(bar.pct),
                      )}
                      style={{ width: `${bar.pct}%` }}
                    />
                  </div>
                  {/* Arc twin, so a ring identity previews as a ring. */}
                  <svg
                    viewBox="0 0 52 52"
                    className="mx-auto -rotate-90 [display:var(--form-meter-ring-display)]"
                    style={{ width: PREVIEW_FORM.ringSize, height: PREVIEW_FORM.ringSize }}
                  >
                    <circle
                      cx="26"
                      cy="26"
                      r="22"
                      fill="none"
                      className="stroke-ui-track"
                      style={{ strokeWidth: "var(--form-meter-ring-width)" }}
                    />
                    <circle
                      cx="26"
                      cy="26"
                      r="22"
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray={RING_CIRCUMFERENCE}
                      strokeDashoffset={RING_CIRCUMFERENCE * (1 - bar.pct / 100)}
                      className={severityStrokeClass(bar.pct)}
                      style={{ strokeWidth: "var(--form-meter-ring-width)" }}
                    />
                  </svg>
                  {bar.caption ? (
                    <span
                      className="truncate leading-none text-ui-tertiary"
                      style={{ fontSize: PREVIEW_FORM.captionSize }}
                    >
                      {bar.caption}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>

            <span
              className="truncate pt-0.5 leading-none text-ui-placeholder"
              style={{ fontSize: PREVIEW_FORM.captionSize }}
            >
              updated just now
            </span>
          </div>
        ))}
        {palette ? (
          <div
            data-ui-surface="menu"
            className="ui-surface absolute right-2 top-0 w-[92px] rounded-[8px] p-1 shadow-menu ring-1 ring-ui-subtle"
          >
            <div className="rounded-md px-1.5 py-1 text-[8px] leading-none">Appearance</div>
            <div className="rounded-md bg-ui-selection px-1.5 py-1 text-[8px] leading-none text-ui-selection-fg">
              Layout
            </div>
            <div className="rounded-md px-1.5 py-1 text-[8px] leading-none text-ui-secondary">
              Quit
            </div>
          </div>
        ) : null}
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
        "flex w-[260px] shrink-0 flex-col border-l border-ui-subtle bg-ui-control/40 p-3",
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[10px] font-medium uppercase tracking-wide text-ui-tertiary">
          Preview
        </div>
        {loading ? (
          <div className="text-[10px] text-ui-tertiary">Loading…</div>
        ) : caption ? (
          <div className="min-w-0 truncate text-[10px] text-ui-tertiary" title={caption}>
            {caption}
          </div>
        ) : null}
      </div>
      <PreviewBackdrop className="flex-1">
        <UsageMonitorPreview className="flex-1" />
      </PreviewBackdrop>
    </aside>
  );
}
