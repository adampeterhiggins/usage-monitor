import { formatPercent, formatReset } from "../../lib/usage/format";
import { severityFillClass, severityStrokeClass } from "../../lib/usage/presentation";
import { cn } from "../../lib/utils";
import { Text } from "./text";

/** Ring geometry in viewBox units. `--form-meter-ring-size` scales the whole
 *  drawing, so the stroke stays proportional at any identity's dial size. */
const RING_RADIUS = 22;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

interface UsageProgressProps {
  label: string;
  usedPercent?: number;
  resetsAt?: number;
  detail?: string;
  compact?: boolean;
}

/**
 * One usage window. Shape is entirely the active visual identity's call:
 * `--form-meter-*` decide the meter's height, corner, notching, and whether
 * it draws as a bar or as an arc. Both meters are rendered and one is
 * switched off with `display`, so no identity state has to reach this
 * primitive — the tokens on `:root` are the whole contract.
 */
export function UsageProgress({ label, usedPercent, resetsAt, detail, compact }: UsageProgressProps) {
  const pct = usedPercent === undefined ? undefined : Math.min(100, Math.max(0, usedPercent));
  const caption = [formatReset(resetsAt), detail].filter(Boolean).join(" · ");
  const value = formatPercent(pct);
  const ariaNow = pct === undefined ? undefined : Math.round(pct);

  return (
    <div
      className={cn("flex min-w-0 flex-col", compact && "gap-0.5")}
      style={compact ? undefined : { gap: "var(--form-window-inner-gap)" }}
    >
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <Text variant="usage-label" color="secondary" className="min-w-0 truncate">
          {label}
        </Text>
        <Text variant="usage-value" className="shrink-0 [display:var(--form-value-display)]">
          {value}
        </Text>
      </div>

      <div
        className="w-full overflow-hidden bg-ui-track [border-radius:var(--form-meter-radius)] [display:var(--form-meter-bar-display)] [height:var(--form-meter-height)]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={ariaNow}
        aria-label={label}
      >
        <div
          className={cn(
            "relative h-full rounded-[inherit] transition-[width] duration-300 ease-out",
            "after:absolute after:inset-0 after:[background-image:var(--form-meter-notch)]",
            severityFillClass(pct),
          )}
          style={{ width: pct === undefined ? "0%" : `${pct}%` }}
        />
      </div>

      <div
        className="relative mx-auto [display:var(--form-meter-ring-display)] [height:var(--form-meter-ring-size)] [width:var(--form-meter-ring-size)]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={ariaNow}
        aria-label={label}
      >
        <svg viewBox="0 0 52 52" className="size-full -rotate-90" aria-hidden="true">
          <circle
            cx="26"
            cy="26"
            r={RING_RADIUS}
            fill="none"
            className="stroke-ui-track"
            style={{ strokeWidth: "var(--form-meter-ring-width)" }}
          />
          {pct !== undefined && pct > 0 ? (
            <circle
              cx="26"
              cy="26"
              r={RING_RADIUS}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={RING_CIRCUMFERENCE * (1 - pct / 100)}
              className={cn("transition-[stroke-dashoffset] duration-300 ease-out", severityStrokeClass(pct))}
              style={{ strokeWidth: "var(--form-meter-ring-width)" }}
            />
          ) : null}
        </svg>
        <Text
          variant="usage-value"
          aria-hidden="true"
          className="absolute inset-0 grid place-items-center"
        >
          {value}
        </Text>
      </div>

      {caption ? (
        <Text variant="usage-caption" color="tertiary" className="truncate">
          {caption}
        </Text>
      ) : null}
    </div>
  );
}
