/** Folds a native scan into the view the Usage History dialog renders:
 *  totals, per-provider and per-model rows, and one entry per period.
 *  Adapted from t3code's `usageMerge` for a single local environment. */

import type {
  UsageHistoryProvider,
  UsageHistoryScan,
  UsageTokenTotals,
} from "../../contracts/usageHistory";
import { priceBucket, type RateTable } from "./pricing";
import type { UsageWindow } from "./window";

/** Stable reading order for charts, summaries, and tables. */
export const USAGE_HISTORY_PROVIDERS: readonly UsageHistoryProvider[] = [
  "claude",
  "codex",
  "cursor",
  "devin",
];

const SOURCE_NAMES: Record<UsageHistoryProvider, string> = {
  claude: "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  devin: "Devin CLI",
};

export interface CostAndTokens {
  costUsd: number;
  totalTokens: number;
}

export interface ProviderTotals extends CostAndTokens {
  provider: UsageHistoryProvider;
  records: number;
  sessions: number;
  costShare: number;
  tokenShare: number;
}

export interface ModelTotals extends CostAndTokens {
  provider: UsageHistoryProvider;
  model: string;
  records: number;
  /** When it equals `records` the cost is unknown, not zero. */
  unpricedRecords: number;
  costShare: number;
}

export interface PeriodTotals extends CostAndTokens {
  byProvider: Partial<Record<UsageHistoryProvider, CostAndTokens>>;
}

export interface UsageHistorySummary extends UsageTokenTotals, CostAndTokens {
  records: number;
  sessions: number;
  /** Providers with real activity, in display order. */
  providers: ProviderTotals[];
  models: ModelTotals[];
  /** One entry per window period, empty periods included. */
  periods: PeriodTotals[];
  costQuality: {
    providerReportedShare: number;
    unpricedShare: number;
    cacheSavingsUsd: number;
  };
  /** Every source is absent: no CLI history on this Mac and no Cursor
   *  account to read. */
  noSources: boolean;
  /** Why some history may be missing, one line per affected source. */
  sourceNotes: string[];
}

export function isModelCostUnknown(model: ModelTotals): boolean {
  return model.records > 0 && model.unpricedRecords >= model.records;
}

function bucketTokens(totals: UsageTokenTotals): number {
  return (
    totals.uncachedInputTokens +
    totals.cachedInputTokens +
    totals.cacheCreationTokens +
    totals.outputTokens
  );
}

export function summarizeUsage(
  scan: UsageHistoryScan,
  window: UsageWindow,
  rates: RateTable,
  devinRates?: RateTable,
): UsageHistorySummary {
  const tokens: UsageTokenTotals = {
    uncachedInputTokens: 0,
    cachedInputTokens: 0,
    cacheCreationTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
  };
  let costUsd = 0;
  let records = 0;
  let unpricedRecords = 0;
  let providerReportedRecords = 0;
  let cacheSavingsUsd = 0;

  const providerAcc = new Map<UsageHistoryProvider, { costUsd: number; totalTokens: number; records: number }>();
  const modelAcc = new Map<
    string,
    { provider: UsageHistoryProvider; model: string; costUsd: number; totalTokens: number; records: number; unpricedRecords: number }
  >();
  const periods: PeriodTotals[] = window.periods.map(() => ({
    costUsd: 0,
    totalTokens: 0,
    byProvider: {},
  }));

  for (const bucket of scan.buckets) {
    const period = periods[bucket.period];
    if (period === undefined) continue;
    const priced = priceBucket(rates, bucket, bucket.provider === "devin" ? devinRates : undefined);
    const bucketTotal = bucketTokens(bucket.totals);

    costUsd += priced.costUsd;
    cacheSavingsUsd += priced.cacheSavingsUsd;
    tokens.uncachedInputTokens += bucket.totals.uncachedInputTokens;
    tokens.cachedInputTokens += bucket.totals.cachedInputTokens;
    tokens.cacheCreationTokens += bucket.totals.cacheCreationTokens;
    tokens.outputTokens += bucket.totals.outputTokens;
    tokens.reasoningTokens += bucket.totals.reasoningTokens;
    records += bucket.records;
    if (priced.costSource === "unpriced") unpricedRecords += bucket.records;
    if (priced.costSource === "providerReported") providerReportedRecords += bucket.records;

    const provider = providerAcc.get(bucket.provider) ?? { costUsd: 0, totalTokens: 0, records: 0 };
    provider.costUsd += priced.costUsd;
    provider.totalTokens += bucketTotal;
    provider.records += bucket.records;
    providerAcc.set(bucket.provider, provider);

    const modelKey = `${bucket.provider}\u0000${bucket.model}`;
    const model = modelAcc.get(modelKey) ?? {
      provider: bucket.provider,
      model: bucket.model,
      costUsd: 0,
      totalTokens: 0,
      records: 0,
      unpricedRecords: 0,
    };
    model.costUsd += priced.costUsd;
    model.totalTokens += bucketTotal;
    model.records += bucket.records;
    if (priced.costSource === "unpriced") model.unpricedRecords += bucket.records;
    modelAcc.set(modelKey, model);

    period.costUsd += priced.costUsd;
    period.totalTokens += bucketTotal;
    const cell = period.byProvider[bucket.provider] ?? { costUsd: 0, totalTokens: 0 };
    cell.costUsd += priced.costUsd;
    cell.totalTokens += bucketTotal;
    period.byProvider[bucket.provider] = cell;
  }

  const totalTokens = bucketTokens(tokens);
  const sessionsByProvider = new Map<UsageHistoryProvider, number>();
  for (const source of scan.sources) {
    sessionsByProvider.set(
      source.provider,
      (sessionsByProvider.get(source.provider) ?? 0) + source.distinctSessions,
    );
  }

  const providers: ProviderTotals[] = USAGE_HISTORY_PROVIDERS.flatMap((provider) => {
    const totals = providerAcc.get(provider);
    if (totals === undefined || (totals.totalTokens === 0 && totals.costUsd === 0)) return [];
    return [
      {
        provider,
        ...totals,
        sessions: sessionsByProvider.get(provider) ?? 0,
        costShare: costUsd === 0 ? 0 : totals.costUsd / costUsd,
        tokenShare: totalTokens === 0 ? 0 : totals.totalTokens / totalTokens,
      },
    ];
  });

  const models: ModelTotals[] = [...modelAcc.values()]
    .map((model) => ({ ...model, costShare: costUsd === 0 ? 0 : model.costUsd / costUsd }))
    .sort((a, b) => b.costUsd - a.costUsd || b.totalTokens - a.totalTokens);

  const sourceNotes = [
    ...new Set(
      scan.sources.flatMap((source) =>
        source.status === "partial" || source.status === "failed"
          ? [source.message ?? `Some ${SOURCE_NAMES[source.provider]} history could not be read.`]
          : [],
      ),
    ),
  ];

  return {
    ...tokens,
    costUsd,
    totalTokens,
    records,
    sessions: providers.reduce((sum, provider) => sum + provider.sessions, 0),
    providers,
    models,
    periods,
    costQuality: {
      providerReportedShare: records === 0 ? 0 : providerReportedRecords / records,
      unpricedShare: records === 0 ? 0 : unpricedRecords / records,
      cacheSavingsUsd,
    },
    noSources: scan.sources.every((source) => source.status === "missing"),
    sourceNotes,
  };
}
