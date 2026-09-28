/** In-panel Usage History: token usage and cost from local Claude Code,
 *  Codex, and Devin CLI history plus Cursor's dashboard, ported from
 *  t3code's Usage page.
 *  A Radix dialog like Appearance — the panel's modal-open bridge keeps it
 *  from blur-hiding. */

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Info, RefreshCw, X } from "lucide-react";

import type { UsageHistoryMetric, UsageHistoryProvider } from "../../contracts/usageHistory";
import { formatFetchedAt } from "../../lib/usage/format";
import {
  formatCount,
  formatPeriod,
  formatShare,
  formatTokens,
  formatUsd,
  isModelCostUnknown,
  USAGE_WINDOW_OPTIONS,
  type UsageHistorySummary,
  type UsagePricingInfo,
  type UsageWindow,
} from "../../lib/usageHistory";
import { cn } from "../../lib/utils";
import { useUsageHistoryStore } from "../../state/usageHistory";
import { Button } from "../ui/button";
import { Tooltip } from "../ui/tooltip";
import { UsageHistoryChart } from "./UsageHistoryChart";
import { usageHistoryProvider } from "./providers";

const METRIC_OPTIONS: ReadonlyArray<{ value: UsageHistoryMetric; label: string }> = [
  { value: "cost", label: "Cost" },
  { value: "tokens", label: "Tokens" },
];

function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-full bg-ui-control p-0.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-6 rounded-full px-2.5 text-[11.5px] font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus/40",
              active
                ? "bg-ui-selection text-ui-selection-fg"
                : "text-ui-secondary hover:text-ui-primary",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function SectionTitle({ children, trailing }: { children: React.ReactNode; trailing?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-[11px] font-medium uppercase tracking-wide text-ui-tertiary">{children}</h3>
      {trailing}
    </div>
  );
}

function ProviderDot({ provider }: { provider: UsageHistoryProvider }) {
  return (
    <span
      aria-hidden
      className="size-2 shrink-0 rounded-full"
      style={{ backgroundColor: usageHistoryProvider(provider).color }}
    />
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate text-[11px] text-ui-tertiary">{label}</span>
      <span className="text-[14px] font-medium tabular-nums text-ui-primary">{value}</span>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="grid gap-5" aria-busy>
      <div className="grid gap-4 min-[640px]:grid-cols-[190px_minmax(0,1fr)]">
        <div className="grid content-start gap-3">
          <div className="h-8 w-32 animate-pulse rounded-lg bg-ui-control" />
          <div className="h-3 w-24 animate-pulse rounded-full bg-ui-control" />
          <div className="h-9 animate-pulse rounded-lg bg-ui-control" />
          <div className="h-9 animate-pulse rounded-lg bg-ui-control" />
        </div>
        <div className="h-44 animate-pulse rounded-xl bg-ui-control" />
      </div>
      <div className="h-10 animate-pulse rounded-lg bg-ui-control" />
      <div className="h-28 animate-pulse rounded-lg bg-ui-control" />
    </div>
  );
}

function PricingNote({
  pricing,
  scanDurationMs,
}: {
  pricing: UsagePricingInfo | null;
  scanDurationMs: number | null;
}) {
  const scanned = scanDurationMs === null ? "" : ` Scanned in ${formatCount(scanDurationMs)} ms.`;
  if (!pricing || pricing.status === "unavailable") {
    return (
      <p className="text-[11px] leading-[1.45] text-ui-tertiary">
        Model rates are unavailable offline, so costs show as unpriced.{scanned}
      </p>
    );
  }
  const updated = pricing.fetchedAtMs === null ? "" : `, updated ${formatFetchedAt(pricing.fetchedAtMs)}`;
  return (
    <p className="text-[11px] leading-[1.45] text-ui-tertiary">
      Costs are API-equivalent estimates at LiteLLM and Devin catalog rates (
      {formatCount(pricing.knownModels)} models{updated}); Cursor reports its own charges. Neither is
      what a subscription plan bills.{scanned}
    </p>
  );
}

function Summary({
  summary,
  window,
  metric,
}: {
  summary: UsageHistorySummary;
  window: UsageWindow;
  metric: UsageHistoryMetric;
}) {
  const [breakdown, setBreakdown] = React.useState<"model" | "period">("model");
  const providers = summary.providers.map((entry) => entry.provider);
  const models = React.useMemo(
    () =>
      metric === "tokens"
        ? [...summary.models].sort((a, b) => b.totalTokens - a.totalTokens || b.costUsd - a.costUsd)
        : summary.models,
    [metric, summary.models],
  );
  // Newest first: a 90-period window keeps its interesting end at the top.
  const periodRows = React.useMemo(
    () =>
      summary.periods
        .map((totals, index) => ({ totals, period: window.periods[index] }))
        .filter((row) => row.totals.totalTokens > 0 || row.totals.costUsd > 0)
        .reverse(),
    [summary.periods, window.periods],
  );
  const periodNoun = window.resolution === "hour" ? "Hour" : "Day";

  return (
    <div className="grid gap-5">
      <section className="grid gap-4 min-[640px]:grid-cols-[190px_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[28px] font-semibold leading-8 tabular-nums text-ui-primary">
              {metric === "cost" ? formatUsd(summary.costUsd) : formatTokens(summary.totalTokens)}
            </span>
            <span className="flex items-center gap-1 text-[11px] text-ui-tertiary">
              {formatCount(summary.sessions)} {summary.sessions === 1 ? "session" : "sessions"}
              {metric === "cost" ? " · API estimate" : null}
              {metric === "cost" && summary.costQuality.unpricedShare > 0 ? (
                <Tooltip
                  label={`Excludes ${formatShare(summary.costQuality.unpricedShare)} of records from models without published rates.`}
                >
                  <button type="button" aria-label="Unpriced usage details" className="inline-flex">
                    <Info className="size-3" />
                  </button>
                </Tooltip>
              ) : null}
            </span>
          </div>

          {summary.providers.map((entry) => (
            <div key={entry.provider} className="flex min-w-0 flex-col gap-0.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 text-[12.5px] text-ui-primary">
                  <ProviderDot provider={entry.provider} />
                  <span className="truncate">{usageHistoryProvider(entry.provider).label}</span>
                </span>
                <span className="shrink-0 text-[12.5px] font-medium tabular-nums text-ui-primary">
                  {metric === "cost" ? formatUsd(entry.costUsd) : formatTokens(entry.totalTokens)}
                </span>
              </div>
              <span className="pl-4 text-[11px] text-ui-tertiary">
                {metric === "cost"
                  ? `${formatShare(entry.costShare)} of cost · ${formatTokens(entry.totalTokens)} tokens`
                  : `${formatShare(entry.tokenShare)} of tokens · ${formatUsd(entry.costUsd)}`}
                {` · ${formatCount(entry.sessions)} ${entry.sessions === 1 ? "session" : "sessions"}`}
              </span>
            </div>
          ))}
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <SectionTitle>
            {window.resolution === "hour" ? "Hourly" : "Daily"} {metric === "tokens" ? "tokens" : "cost"}
          </SectionTitle>
          <UsageHistoryChart
            providers={providers}
            periods={summary.periods}
            window={window}
            metric={metric}
          />
        </div>
      </section>

      <section className="grid gap-2">
        <SectionTitle>Totals</SectionTitle>
        <div className="grid grid-cols-3 gap-x-4 gap-y-3 min-[640px]:grid-cols-6">
          <Metric label="Processed" value={formatTokens(summary.totalTokens)} />
          <Metric label="Cached input" value={formatTokens(summary.cachedInputTokens)} />
          <Metric label="Uncached input" value={formatTokens(summary.uncachedInputTokens)} />
          <Metric label="Cache writes" value={formatTokens(summary.cacheCreationTokens)} />
          <Metric label="Output" value={formatTokens(summary.outputTokens)} />
          <Metric label="Cache savings" value={formatUsd(summary.costQuality.cacheSavingsUsd)} />
        </div>
      </section>

      <section className="grid gap-2">
        <SectionTitle
          trailing={
            <Segmented
              label="Breakdown"
              value={breakdown}
              options={[
                { value: "model", label: "Model" },
                { value: "period", label: periodNoun },
              ]}
              onChange={setBreakdown}
            />
          }
        >
          Breakdown
        </SectionTitle>

        {breakdown === "model" ? (
          <table className="w-full table-fixed text-[12px]">
            <colgroup>
              <col className="w-[46%]" />
              <col className="w-[18%]" />
              <col className="w-[18%]" />
              <col className="w-[18%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-ui-subtle text-left text-[11px] text-ui-tertiary">
                <th className="py-1.5 font-normal">Model</th>
                <th className="py-1.5 text-right font-normal">Cost</th>
                <th className="py-1.5 text-right font-normal">Share</th>
                <th className="py-1.5 text-right font-normal">Tokens</th>
              </tr>
            </thead>
            <tbody>
              {models.map((model) => {
                const unknown = isModelCostUnknown(model);
                return (
                  <tr key={`${model.provider}:${model.model}`} className="border-b border-ui-subtle/60">
                    <td className="py-1.5 text-ui-primary">
                      <span className="flex min-w-0 items-center gap-2">
                        <ProviderDot provider={model.provider} />
                        <span className="truncate" title={model.model}>
                          {model.model}
                        </span>
                      </span>
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-ui-primary">
                      {unknown ? <span className="text-ui-tertiary">Unpriced</span> : formatUsd(model.costUsd)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-ui-secondary">
                      {unknown ? "—" : formatShare(model.costShare)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-ui-secondary">
                      {formatTokens(model.totalTokens)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table className="w-full table-fixed text-[12px]">
            <thead>
              <tr className="border-b border-ui-subtle text-left text-[11px] text-ui-tertiary">
                <th className="w-[28%] py-1.5 font-normal">{periodNoun}</th>
                {providers.map((provider) => (
                  <th key={provider} className="py-1.5 text-right font-normal">
                    {usageHistoryProvider(provider).label}
                  </th>
                ))}
                <th className="py-1.5 text-right font-normal">Total</th>
                <th className="py-1.5 text-right font-normal">Tokens</th>
              </tr>
            </thead>
            <tbody>
              {periodRows.map(({ totals, period }) => (
                <tr key={period.key} className="border-b border-ui-subtle/60">
                  <td className="py-1.5 text-ui-primary">{formatPeriod(period, window.resolution)}</td>
                  {providers.map((provider) => (
                    <td key={provider} className="py-1.5 text-right tabular-nums text-ui-secondary">
                      {formatUsd(totals.byProvider[provider]?.costUsd ?? 0)}
                    </td>
                  ))}
                  <td className="py-1.5 text-right tabular-nums text-ui-primary">
                    {formatUsd(totals.costUsd)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-ui-secondary">
                    {formatTokens(totals.totalTokens)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Body() {
  const status = useUsageHistoryStore((s) => s.status);
  const summary = useUsageHistoryStore((s) => s.summary);
  const window = useUsageHistoryStore((s) => s.window);
  const metric = useUsageHistoryStore((s) => s.metric);
  const error = useUsageHistoryStore((s) => s.error);

  if (status === "error" && !summary) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
        <p className="text-[13px] font-medium text-ui-primary">Couldn’t read usage history</p>
        <p className="max-w-sm text-[12px] text-ui-secondary">{error}</p>
        <Button className="mt-2" onClick={() => void useUsageHistoryStore.getState().refresh()}>
          Try Again
        </Button>
      </div>
    );
  }
  if (!summary || !window) return <Skeleton />;

  if (summary.noSources) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
        <p className="text-[13px] font-medium text-ui-primary">No usage history found</p>
        <p className="max-w-sm text-[12px] text-ui-secondary">
          Usage history reads the session logs Claude Code, Codex, and the Devin CLI keep on this
          Mac, and the dashboard history of your Cursor accounts. Use any of them and its usage
          appears here.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {summary.sourceNotes.map((note) => (
        <p key={note} className="text-[11px] leading-[1.45] text-ui-status-warning-text">
          {note}
        </p>
      ))}
      {summary.records === 0 ? (
        <p className="rounded-lg bg-ui-control px-3 py-2 text-[12px] text-ui-secondary">
          No activity in this window.
        </p>
      ) : (
        <Summary summary={summary} window={window} metric={metric} />
      )}
      {error ? (
        <p className="text-[11px] text-ui-status-critical-text">Last refresh failed: {error}</p>
      ) : null}
    </div>
  );
}

export function UsageHistoryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const windowDays = useUsageHistoryStore((s) => s.windowDays);
  const metric = useUsageHistoryStore((s) => s.metric);
  const busy = useUsageHistoryStore((s) => s.status === "loading");
  const pricing = useUsageHistoryStore((s) => s.pricing);
  const scanDurationMs = useUsageHistoryStore((s) => s.scanDurationMs);

  React.useEffect(() => {
    if (open) void useUsageHistoryStore.getState().open();
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 rounded-[16px] bg-ui-scrim" />
        <Dialog.Content
          data-ui-surface="menu"
          className="ui-surface fixed left-1/2 top-1/2 z-50 flex h-[min(448px,calc(100vh-1.5rem))] w-[min(768px,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl p-5 shadow-xl ring-1 ring-ui-subtle"
        >
          <div className="flex shrink-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <Dialog.Title className="text-[16px] font-semibold">Usage History</Dialog.Title>
              <Dialog.Description className="mt-1 text-[12px] text-ui-secondary">
                Tokens and cost from Claude Code, Codex, Cursor, and Devin.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button iconOnly variant="transparent" size="small" aria-label="Close">
                <X className="size-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2">
            <Segmented
              label="Metric"
              value={metric}
              options={METRIC_OPTIONS}
              onChange={(next) => useUsageHistoryStore.getState().setMetric(next)}
            />
            <Segmented
              label="Period"
              value={windowDays}
              options={USAGE_WINDOW_OPTIONS.map((option) => ({ value: option.days, label: option.label }))}
              onChange={(next) => useUsageHistoryStore.getState().setWindowDays(next)}
            />
            <Tooltip label="Refresh">
              <Button
                iconOnly
                variant="transparent"
                size="small"
                aria-label="Refresh usage history"
                aria-busy={busy}
                disabled={busy}
                className="ml-auto"
                onClick={() => void useUsageHistoryStore.getState().refresh()}
              >
                <RefreshCw className={cn("size-3.5", busy && "animate-spin")} />
              </Button>
            </Tooltip>
          </div>

          <div className="mt-4 min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1">
            <Body />
          </div>

          <div className="mt-4 flex shrink-0 items-end justify-between gap-4">
            <PricingNote pricing={pricing} scanDurationMs={scanDurationMs} />
            <Dialog.Close asChild>
              <Button variant="glass" className="shrink-0">
                Done
              </Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
