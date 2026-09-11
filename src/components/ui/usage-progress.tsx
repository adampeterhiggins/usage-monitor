import { formatPercent, formatReset } from "../../lib/usage/format";
import { severityFillClass } from "../../lib/usage/presentation";
import { cn, Text } from ".";

interface UsageProgressProps {
  label: string;
  usedPercent?: number;
  resetsAt?: number;
  detail?: string;
  compact?: boolean;
}

export function UsageProgress({ label, usedPercent, resetsAt, detail, compact }: UsageProgressProps) {
  const pct = usedPercent === undefined ? undefined : Math.min(100, Math.max(0, usedPercent));
  const caption = [formatReset(resetsAt), detail].filter(Boolean).join(" · ");

  return (
    <div className={cn("flex min-w-0 flex-col gap-1", compact && "gap-0.5")}>
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <Text variant="small" color="secondary" className="min-w-0 truncate">
          {label}
        </Text>
        <Text variant="small-strong" className="shrink-0 tabular-nums">
          {formatPercent(pct)}
        </Text>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-control-subtle"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct === undefined ? undefined : Math.round(pct)}
        aria-label={label}
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-300 ease-out", severityFillClass(pct))}
          style={{ width: pct === undefined ? "0%" : `${pct}%` }}
        />
      </div>
      {caption ? (
        <Text variant="mini" color="tertiary" className="truncate">
          {caption}
        </Text>
      ) : null}
    </div>
  );
}
