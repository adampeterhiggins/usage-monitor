/** Layered per-provider area chart for usage history, ported from t3code's
 *  `UsageProviderChart`: monotone curves that cannot overshoot spiky data,
 *  a 1/2/5 × 10ⁿ scale, and a hover readout that follows the pointer. */

import * as React from "react";

import type { UsageHistoryMetric, UsageHistoryProvider } from "../../contracts/usageHistory";
import {
  formatPeriod,
  formatPeriodDetail,
  formatTokens,
  formatUsd,
  type PeriodTotals,
  type UsageWindow,
} from "../../lib/usageHistory";
import { usageHistoryProvider } from "./providers";

const VIEW_WIDTH = 960;
const VIEW_HEIGHT = 240;
const PLOT_TOP = 8;
const TICK_COUNT = 4;

interface Point {
  x: number;
  y: number;
}

/** Shape-preserving cubic tangents (Fritsch–Carlson). */
function monotoneTangents(points: readonly Point[]): number[] {
  const count = points.length;
  if (count < 2) return [0];
  const slopes: number[] = [];
  for (let i = 0; i < count - 1; i += 1) {
    const dx = points[i + 1].x - points[i].x;
    slopes.push(dx === 0 ? 0 : (points[i + 1].y - points[i].y) / dx);
  }
  const tangents = Array.from({ length: count }, () => 0);
  tangents[0] = slopes[0];
  tangents[count - 1] = slopes[count - 2];
  for (let i = 1; i < count - 1; i += 1) {
    tangents[i] = slopes[i - 1] * slopes[i] <= 0 ? 0 : (slopes[i - 1] + slopes[i]) / 2;
  }
  for (let i = 0; i < count - 1; i += 1) {
    const slope = slopes[i];
    if (slope === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const a = tangents[i] / slope;
    const b = tangents[i + 1] / slope;
    const magnitude = a * a + b * b;
    if (magnitude > 9) {
      const scale = 3 / Math.sqrt(magnitude);
      tangents[i] = scale * a * slope;
      tangents[i + 1] = scale * b * slope;
    }
  }
  return tangents;
}

function curvePath(points: readonly Point[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const { y } = points[0];
    return `M0,${y.toFixed(2)} L${VIEW_WIDTH},${y.toFixed(2)}`;
  }
  const tangents = monotoneTangents(points);
  let path = `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const from = points[i];
    const to = points[i + 1];
    const dx = to.x - from.x;
    const c1 = { x: from.x + dx / 3, y: from.y + (tangents[i] * dx) / 3 };
    const c2 = { x: to.x - dx / 3, y: to.y - (tangents[i + 1] * dx) / 3 };
    path += ` C${c1.x.toFixed(2)},${c1.y.toFixed(2)} ${c2.x.toFixed(2)},${c2.y.toFixed(2)} ${to.x.toFixed(2)},${to.y.toFixed(2)}`;
  }
  return path;
}

/** A readable 1/2/5 × 10ⁿ maximum at or above the peak — rounding *up* so
 *  the tallest period is never clipped past the top of the plot. */
export function niceScale(peak: number, count: number): { max: number; ticks: number[] } {
  if (peak <= 0) return { max: 0, ticks: [0] };
  const rawStep = peak / count;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const step = (normalized > 5 ? 10 : normalized > 2 ? 5 : normalized > 1 ? 2 : 1) * magnitude;
  const max = Math.ceil(peak / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= max + step * 1e-6; value += step) ticks.push(value);
  return { max, ticks };
}

function valueOf(period: PeriodTotals, provider: UsageHistoryProvider, metric: UsageHistoryMetric) {
  const cell = period.byProvider[provider];
  if (!cell) return 0;
  return metric === "tokens" ? cell.totalTokens : cell.costUsd;
}

export function UsageHistoryChart({
  providers,
  periods,
  window,
  metric,
}: {
  providers: readonly UsageHistoryProvider[];
  periods: readonly PeriodTotals[];
  window: UsageWindow;
  metric: UsageHistoryMetric;
}) {
  const [hoverIndex, setHoverIndex] = React.useState<number | null>(null);
  const [hoverPoint, setHoverPoint] = React.useState<Point | null>(null);
  const plotRef = React.useRef<HTMLDivElement>(null);
  const tooltipRef = React.useRef<HTMLDivElement>(null);
  const format = metric === "tokens" ? formatTokens : formatUsd;

  const { series, ticks, toY, stepX } = React.useMemo(() => {
    // Layered series each measure from zero, so the scale tops out at the
    // largest single provider-period rather than the combined peak.
    const peak = periods.reduce(
      (max, period) => providers.reduce((inner, p) => Math.max(inner, valueOf(period, p, metric)), max),
      0,
    );
    const { max, ticks } = niceScale(peak, TICK_COUNT);
    const stepX = periods.length <= 1 ? 0 : VIEW_WIDTH / (periods.length - 1);
    const toY = (value: number) =>
      max === 0 ? VIEW_HEIGHT : VIEW_HEIGHT - (value / max) * (VIEW_HEIGHT - PLOT_TOP);
    const series = providers
      .map((provider) => {
        const values = periods.map((period) => valueOf(period, provider, metric));
        const line = curvePath(values.map((value, i) => ({ x: i * stepX, y: toY(value) })));
        return {
          provider,
          total: values.reduce((sum, value) => sum + value, 0),
          line,
          area: line === "" ? "" : `${line} L${VIEW_WIDTH},${VIEW_HEIGHT} L0,${VIEW_HEIGHT} Z`,
        };
      })
      // Paint the heavier series first so the lighter one is not buried.
      .sort((a, b) => b.total - a.total);
    return { series, ticks, toY, stepX };
  }, [metric, periods, providers]);

  function handleMove(event: React.MouseEvent<HTMLDivElement>) {
    const plot = plotRef.current;
    if (!plot || periods.length === 0) return;
    const bounds = plot.getBoundingClientRect();
    if (bounds.width === 0) return;
    const x = Math.min(bounds.width, Math.max(0, event.clientX - bounds.left));
    const y = Math.min(bounds.height, Math.max(0, event.clientY - bounds.top));
    setHoverPoint({ x, y });
    setHoverIndex(Math.round((x / bounds.width) * (periods.length - 1)));
  }

  const [tooltipPosition, setTooltipPosition] = React.useState<Point>({ x: 0, y: 0 });
  React.useLayoutEffect(() => {
    const plot = plotRef.current;
    const tooltip = tooltipRef.current;
    if (!plot || !tooltip || !hoverPoint) return;
    const gap = 12;
    const width = tooltip.offsetWidth;
    const height = tooltip.offsetHeight;
    const left =
      hoverPoint.x + gap + width <= plot.clientWidth ? hoverPoint.x + gap : hoverPoint.x - gap - width;
    const top =
      hoverPoint.y + gap + height <= plot.clientHeight ? hoverPoint.y + gap : hoverPoint.y - gap - height;
    setTooltipPosition({
      x: Math.min(Math.max(0, left), Math.max(0, plot.clientWidth - width)),
      y: Math.min(Math.max(0, top), Math.max(0, plot.clientHeight - height)),
    });
  }, [hoverPoint, hoverIndex]);

  const hovered = hoverIndex === null ? undefined : periods[hoverIndex];
  const hoveredPeriod = hoverIndex === null ? undefined : window.periods[hoverIndex];
  const labelIndexes = [0, Math.floor((periods.length - 1) / 2), periods.length - 1];

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <div className="relative h-40 w-12 shrink-0">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-0 -translate-y-1/2 text-[10px] tabular-nums text-ui-tertiary"
              style={{ top: `${(toY(tick) / VIEW_HEIGHT) * 100}%` }}
            >
              {tick === 0 ? "0" : format(tick)}
            </span>
          ))}
        </div>

        <div
          ref={plotRef}
          className="relative h-40 min-w-0 flex-1"
          onMouseMove={handleMove}
          onMouseLeave={() => {
            setHoverIndex(null);
            setHoverPoint(null);
          }}
        >
          <svg
            className="h-full w-full overflow-visible"
            viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`${window.resolution === "hour" ? "Hourly" : "Daily"} ${metric === "tokens" ? "tokens" : "cost"} by provider`}
          >
            {ticks.map((tick) => (
              <line
                key={tick}
                x1={0}
                x2={VIEW_WIDTH}
                y1={toY(tick)}
                y2={toY(tick)}
                stroke="currentColor"
                strokeWidth={1}
                className="text-ui-subtle"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {/* Fills first, then every stroke, so no series covers another's line. */}
            {series.map(({ provider, area }) => (
              <path key={provider} d={area} fill={usageHistoryProvider(provider).color} fillOpacity={0.14} />
            ))}
            {series.map(({ provider, line }) => (
              <path
                key={provider}
                d={line}
                fill="none"
                stroke={usageHistoryProvider(provider).color}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {hoverIndex === null ? null : (
              <line
                x1={hoverIndex * stepX}
                x2={hoverIndex * stepX}
                y1={PLOT_TOP}
                y2={VIEW_HEIGHT}
                stroke="currentColor"
                strokeWidth={1}
                className="text-ui-tertiary"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>

          {hovered && hoveredPeriod ? (
            <div
              ref={tooltipRef}
              data-ui-surface="menu"
              className="ui-surface pointer-events-none absolute z-10 min-w-36 rounded-lg px-2.5 py-2 text-[11px] shadow-menu ring-1 ring-ui-subtle"
              style={{ left: tooltipPosition.x, top: tooltipPosition.y }}
            >
              <div className="mb-1 text-ui-tertiary">{formatPeriodDetail(hoveredPeriod, window)}</div>
              {providers.map((provider) => (
                <div key={provider} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-ui-secondary">
                    <span
                      aria-hidden
                      className="size-1.5 rounded-full"
                      style={{ backgroundColor: usageHistoryProvider(provider).color }}
                    />
                    {usageHistoryProvider(provider).label}
                  </span>
                  <span className="tabular-nums text-ui-primary">
                    {format(valueOf(hovered, provider, metric))}
                  </span>
                </div>
              ))}
              <div className="mt-1 flex items-center justify-between gap-3 border-t border-ui-subtle pt-1">
                <span className="text-ui-tertiary">Total</span>
                <span className="tabular-nums text-ui-primary">
                  {format(metric === "tokens" ? hovered.totalTokens : hovered.costUsd)}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex justify-between pl-14 text-[10px] uppercase text-ui-tertiary">
        {labelIndexes.map((index, position) => (
          <span key={position}>
            {window.periods[index] ? formatPeriod(window.periods[index], window.resolution) : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
