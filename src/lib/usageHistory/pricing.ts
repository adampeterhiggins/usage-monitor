/** Model rate lookup and cost arithmetic, ported from t3code's
 *  `usagePricing`. Rates come from LiteLLM's
 *  `model_prices_and_context_window.json`, the table ccusage prices
 *  against. Pure: fetching and caching live in `rates.ts`. */

import type { UsageHistoryBucket } from "../../contracts/usageHistory";

/** USD per token. LiteLLM also publishes tiered variants (`*_above_272k`,
 *  `*_flex`, `*_priority`); we price at the base tier because transcripts
 *  don't record which tier served a request. */
export interface ModelRate {
  inputCostPerToken: number;
  outputCostPerToken: number;
  cacheReadCostPerToken: number;
  cacheCreationCostPerToken: number;
  /** Multiple billed for a fast-mode request (`provider_specific_entry.fast`). */
  fastMultiplier: number;
}

export type RateTable = ReadonlyMap<string, ModelRate>;

/** Why a cell's cost is what it is. `unpriced` means tokens are known but
 *  rates are not — counted in token totals, excluded from cost. */
export type UsageCostSource = "providerReported" | "modelPriced" | "unpriced";

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function fastMultiplier(entry: Record<string, unknown>): number {
  const specific = entry.provider_specific_entry;
  if (typeof specific !== "object" || specific === null) return 1;
  const fast = finiteNumber((specific as Record<string, unknown>).fast);
  return fast !== null && fast > 0 ? fast : 1;
}

function normalizeRateKey(model: string): string {
  return model.trim().toLowerCase();
}

function bareModelName(key: string): string {
  const slash = key.lastIndexOf("/");
  return slash === -1 ? key : key.slice(slash + 1);
}

function sameRate(a: ModelRate, b: ModelRate): boolean {
  return (
    a.inputCostPerToken === b.inputCostPerToken &&
    a.outputCostPerToken === b.outputCostPerToken &&
    a.cacheReadCostPerToken === b.cacheReadCostPerToken &&
    a.cacheCreationCostPerToken === b.cacheCreationCostPerToken &&
    a.fastMultiplier === b.fastMultiplier
  );
}

/**
 * Projects the LiteLLM document into a rate table.
 *
 * Entries without both an input and an output rate are dropped: a half-priced
 * model would silently under-report cost, which is worse than unpriced. A
 * bare name (`gpt-5` for `openai/gpt-5`) is aliased only when no canonical
 * entry exists and every qualified entry agrees on the rate.
 */
export function parseRateTable(document: unknown): Map<string, ModelRate> {
  const table = new Map<string, ModelRate>();
  if (typeof document !== "object" || document === null) return table;

  for (const [name, raw] of Object.entries(document as Record<string, unknown>)) {
    if (typeof raw !== "object" || raw === null) continue;
    const entry = raw as Record<string, unknown>;
    const input = finiteNumber(entry.input_cost_per_token);
    const output = finiteNumber(entry.output_cost_per_token);
    if (input === null || output === null) continue;
    const key = normalizeRateKey(name);
    if (key.length === 0) continue;
    table.set(key, {
      inputCostPerToken: input,
      outputCostPerToken: output,
      // Cached input with no published rate is priced as plain input, not free.
      cacheReadCostPerToken: finiteNumber(entry.cache_read_input_token_cost) ?? input,
      cacheCreationCostPerToken: finiteNumber(entry.cache_creation_input_token_cost) ?? input,
      fastMultiplier: fastMultiplier(entry),
    });
  }

  // `null` marks a bare name claimed at conflicting rates: no alias for it.
  const aliasCandidates = new Map<string, ModelRate | null>();
  for (const [key, rate] of table) {
    const alias = bareModelName(key);
    if (alias.length === 0 || alias === key || table.has(alias)) continue;
    const held = aliasCandidates.get(alias);
    if (held === undefined) aliasCandidates.set(alias, rate);
    else if (held !== null && !sameRate(held, rate)) aliasCandidates.set(alias, null);
  }
  for (const [alias, rate] of aliasCandidates) {
    if (rate !== null) table.set(alias, rate);
  }
  return table;
}

/** Drops a bracketed variant suffix such as `claude-fable-5-1[1m]`, which
 *  Claude Code writes for the 1M context tier. */
function stripVariantSuffix(key: string): string {
  const bracket = key.indexOf("[");
  return bracket === -1 ? key : key.slice(0, bracket);
}

/** `<synthetic>` marks locally generated messages that were never billed.
 *  Bare family names are ambiguous across generations, so they stay
 *  unpriced rather than guessing one. */
const UNPRICEABLE_MODELS = new Set(["<synthetic>", "synthetic", "opus", "sonnet", "haiku", "fable"]);

export function lookupRate(table: RateTable, model: string): ModelRate | null {
  const key = stripVariantSuffix(normalizeRateKey(model));
  const bareName = bareModelName(key);
  if (bareName.length === 0 || UNPRICEABLE_MODELS.has(bareName)) return null;
  return table.get(key) ?? null;
}

export interface PricedBucket {
  costUsd: number;
  costSource: UsageCostSource;
  /** What the cached input would have cost at full input rates minus what
   *  it actually cost. */
  cacheSavingsUsd: number;
}

/** Normalizes a Devin model uid the way its catalog does (`MODEL_GPT_5_2_LOW`
 *  and `model-gpt-5-2-low` are one model). */
export function normalizeDevinModelId(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, "-");
}

/**
 * Parses a Devin catalog `cost_summary` such as
 * `$5 / 1M Input · $0.5 / 1M Cached input · $25 / 1M Output` into a rate.
 * Unrecognized segments (`Sidekick: Free`) are skipped; a rate needs both
 * input and output, as with LiteLLM.
 */
export function parseDevinCostSummary(summary: unknown): ModelRate | null {
  if (typeof summary !== "string" || summary.length === 0) return null;
  let input: number | undefined;
  let cachedInput: number | undefined;
  let cacheCreation: number | undefined;
  let output: number | undefined;
  for (const segment of summary.split("·")) {
    const match = /\$(\d+(?:\.\d+)?)\s*\/\s*1M\s+(.+)$/i.exec(segment.trim());
    if (!match) continue;
    const rate = Number(match[1]);
    if (!Number.isFinite(rate) || rate < 0) continue;
    const field = match[2].trim().toLowerCase();
    if (field === "input") input = rate;
    else if (field === "cached input") cachedInput = rate;
    else if (field === "cache creation" || field === "cache write") cacheCreation = rate;
    else if (field === "output") output = rate;
  }
  if (input === undefined || output === undefined) return null;
  return {
    inputCostPerToken: input / 1_000_000,
    outputCostPerToken: output / 1_000_000,
    cacheReadCostPerToken: (cachedInput ?? input) / 1_000_000,
    cacheCreationCostPerToken: (cacheCreation ?? input) / 1_000_000,
    fastMultiplier: 1,
  };
}

/** Rates advertised by `devin models list --format json`, keyed by
 *  normalized variant uid. */
export function parseDevinCatalogRates(document: unknown): Map<string, ModelRate> {
  const table = new Map<string, ModelRate>();
  const families = (document as { families?: unknown } | null)?.families;
  if (!Array.isArray(families)) return table;
  for (const family of families) {
    const variants = (family as { variants?: unknown } | null)?.variants;
    if (!Array.isArray(variants)) continue;
    for (const variant of variants) {
      const entry = variant as { model_uid?: unknown; cost_summary?: unknown } | null;
      if (typeof entry?.model_uid !== "string" || entry.model_uid.trim() === "") continue;
      const rate = parseDevinCostSummary(entry.cost_summary);
      if (rate) table.set(normalizeDevinModelId(entry.model_uid), rate);
    }
  }
  return table;
}

/** Prices one cell. Pricing is linear in tokens, so a whole bucket prices
 *  exactly like its records would individually. `reasoningTokens` is not
 *  charged separately: it is already inside `outputTokens`.
 *
 *  `providerTable` holds a provider's own advertised rates (Devin's
 *  catalog); it wins over LiteLLM for that provider's models. */
export function priceBucket(
  table: RateTable,
  bucket: UsageHistoryBucket,
  providerTable?: RateTable,
): PricedBucket {
  const rateModel = bucket.rateModel ?? bucket.model;
  const rate =
    providerTable?.get(normalizeDevinModelId(rateModel)) ?? lookupRate(table, rateModel);
  const multiplier = bucket.fast && rate !== null ? rate.fastMultiplier : 1;
  const cacheSavingsUsd =
    rate === null
      ? 0
      : bucket.totals.cachedInputTokens *
        (rate.inputCostPerToken - rate.cacheReadCostPerToken) *
        multiplier;

  if (bucket.costReported && Number.isFinite(bucket.reportedCostUsd)) {
    return { costUsd: bucket.reportedCostUsd, costSource: "providerReported", cacheSavingsUsd };
  }
  if (rate === null) return { costUsd: 0, costSource: "unpriced", cacheSavingsUsd: 0 };

  const { totals } = bucket;
  const standardCostUsd =
    totals.uncachedInputTokens * rate.inputCostPerToken +
    totals.cachedInputTokens * rate.cacheReadCostPerToken +
    totals.cacheCreationTokens * rate.cacheCreationCostPerToken +
    totals.outputTokens * rate.outputCostPerToken;
  return { costUsd: standardCostUsd * multiplier, costSource: "modelPriced", cacheSavingsUsd };
}

/** Compact persisted form: `[input, output, cacheRead, cacheCreation, fast]`. */
export type SerializedRateTable = Record<string, [number, number, number, number, number]>;

export function serializeRateTable(table: RateTable): SerializedRateTable {
  const out: SerializedRateTable = {};
  for (const [model, rate] of table) {
    out[model] = [
      rate.inputCostPerToken,
      rate.outputCostPerToken,
      rate.cacheReadCostPerToken,
      rate.cacheCreationCostPerToken,
      rate.fastMultiplier,
    ];
  }
  return out;
}

export function deserializeRateTable(value: unknown): Map<string, ModelRate> {
  const table = new Map<string, ModelRate>();
  if (typeof value !== "object" || value === null) return table;
  for (const [model, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(raw) || raw.length !== 5 || !raw.every((n) => finiteNumber(n) !== null)) {
      continue;
    }
    const [input, output, cacheRead, cacheCreation, fast] = raw as number[];
    table.set(model, {
      inputCostPerToken: input,
      outputCostPerToken: output,
      cacheReadCostPerToken: cacheRead,
      cacheCreationCostPerToken: cacheCreation,
      fastMultiplier: fast,
    });
  }
  return table;
}
