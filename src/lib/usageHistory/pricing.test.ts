import { describe, expect, it } from "vitest";

import type { UsageHistoryBucket } from "../../contracts/usageHistory";
import {
  deserializeRateTable,
  lookupRate,
  normalizeDevinModelId,
  parseDevinCatalogRates,
  parseDevinCostSummary,
  parseRateTable,
  priceBucket,
  serializeRateTable,
} from "./pricing";

const DOCUMENT = {
  "claude-opus-4-5": {
    input_cost_per_token: 5e-6,
    output_cost_per_token: 25e-6,
    cache_read_input_token_cost: 0.5e-6,
    cache_creation_input_token_cost: 6.25e-6,
    provider_specific_entry: { fast: 2 },
  },
  "openai/gpt-5-codex": { input_cost_per_token: 1.25e-6, output_cost_per_token: 10e-6 },
  "azure/gpt-5-codex": { input_cost_per_token: 1.25e-6, output_cost_per_token: 10e-6 },
  "a/conflict": { input_cost_per_token: 1e-6, output_cost_per_token: 1e-6 },
  "b/conflict": { input_cost_per_token: 2e-6, output_cost_per_token: 2e-6 },
  "half-priced": { input_cost_per_token: 1e-6 },
  sample_spec: "not an entry",
};

function bucket(overrides: Partial<UsageHistoryBucket> = {}): UsageHistoryBucket {
  return {
    period: 0,
    provider: "claude",
    model: "claude-opus-4-5",
    fast: false,
    costReported: false,
    reportedCostUsd: 0,
    totals: {
      uncachedInputTokens: 1_000_000,
      cachedInputTokens: 1_000_000,
      cacheCreationTokens: 0,
      outputTokens: 1_000_000,
      reasoningTokens: 500_000,
    },
    records: 3,
    ...overrides,
  };
}

describe("parseRateTable", () => {
  const table = parseRateTable(DOCUMENT);

  it("drops entries missing an input or output rate", () => {
    expect(table.has("half-priced")).toBe(false);
    expect(table.has("sample_spec")).toBe(false);
  });

  it("aliases bare names only when qualified entries agree", () => {
    expect(lookupRate(table, "gpt-5-codex")?.inputCostPerToken).toBe(1.25e-6);
    expect(lookupRate(table, "conflict")).toBeNull();
  });

  it("defaults cache rates to the input rate", () => {
    expect(lookupRate(table, "gpt-5-codex")?.cacheReadCostPerToken).toBe(1.25e-6);
  });

  it("strips variant suffixes and refuses ambiguous family names", () => {
    expect(lookupRate(table, "Claude-Opus-4-5[1m]")).not.toBeNull();
    expect(lookupRate(table, "opus")).toBeNull();
    expect(lookupRate(table, "<synthetic>")).toBeNull();
  });

  it("round-trips through the persisted form", () => {
    expect(deserializeRateTable(serializeRateTable(table))).toEqual(table);
  });
});

describe("priceBucket", () => {
  const table = parseRateTable(DOCUMENT);

  it("prices each token class and never charges reasoning separately", () => {
    const priced = priceBucket(table, bucket());
    expect(priced.costSource).toBe("modelPriced");
    expect(priced.costUsd).toBeCloseTo(5 + 0.5 + 25);
    expect(priced.cacheSavingsUsd).toBeCloseTo(4.5);
  });

  it("applies the fast multiplier", () => {
    expect(priceBucket(table, bucket({ fast: true })).costUsd).toBeCloseTo(61);
  });

  it("prefers a provider-reported cost", () => {
    const priced = priceBucket(table, bucket({ costReported: true, reportedCostUsd: 1.23 }));
    expect(priced).toMatchObject({ costUsd: 1.23, costSource: "providerReported" });
  });

  it("reports unknown models as unpriced rather than free", () => {
    expect(priceBucket(table, bucket({ model: "mystery-1" }))).toEqual({
      costUsd: 0,
      costSource: "unpriced",
      cacheSavingsUsd: 0,
    });
  });
});

describe("Devin catalog rates", () => {
  it("parses cost summaries and skips unrecognized segments", () => {
    const rate = parseDevinCostSummary(
      "$5 / 1M Input · $0.5 / 1M Cached input · $25 / 1M Output · Sidekick: Free",
    );
    expect(rate?.inputCostPerToken).toBeCloseTo(5e-6);
    expect(rate?.cacheReadCostPerToken).toBeCloseTo(0.5e-6);
    expect(rate?.cacheCreationCostPerToken).toBeCloseTo(5e-6);
    expect(rate?.outputCostPerToken).toBeCloseTo(25e-6);
    expect(parseDevinCostSummary("$1 / 1M Input")).toBeNull();
    expect(parseDevinCostSummary(undefined)).toBeNull();
  });

  it("keys the catalog by normalized variant uid", () => {
    const table = parseDevinCatalogRates({
      families: [
        {
          variants: [
            { model_uid: "MODEL_SWE_1_7", cost_summary: "$0.5 / 1M Input · $2.5 / 1M Output" },
            { model_uid: "swe-2-max" },
          ],
        },
      ],
    });
    expect([...table.keys()]).toEqual(["model-swe-1-7"]);
    expect(normalizeDevinModelId("MODEL_SWE_1_7")).toBe("model-swe-1-7");
  });

  it("prefers the provider table and honours rateModel", () => {
    const litellm = parseRateTable({ "claude-opus-5": { input_cost_per_token: 1e-6, output_cost_per_token: 1e-6 } });
    const cursorBucket = bucket({ provider: "cursor", model: "claude-opus-5-high", rateModel: "claude-opus-5" });
    expect(priceBucket(litellm, cursorBucket).costSource).toBe("modelPriced");
    const devinTable = parseDevinCatalogRates({
      families: [{ variants: [{ model_uid: "swe-1-7", cost_summary: "$1 / 1M Input · $1 / 1M Output" }] }],
    });
    expect(priceBucket(litellm, bucket({ provider: "devin", model: "swe-1-7" }), devinTable).costUsd).toBeCloseTo(3);
  });
});
