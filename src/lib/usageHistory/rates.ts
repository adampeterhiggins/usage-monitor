/** Loads the rate tables usage history prices against, preferring fresh
 *  copies and falling back to persisted snapshots. With neither, models
 *  report as unpriced rather than the dialog failing.
 *
 *  - LiteLLM's public table covers Claude, Codex, and Cursor's base models.
 *  - The Devin CLI's own catalog covers Devin's models (`swe-*`), which
 *    LiteLLM does not list. */

import { fetchJson } from "../../platform/http";
import { openDocumentStore } from "../../platform/persistence";
import { readDevinModelCatalog } from "../../platform/usageHistory";
import {
  deserializeRateTable,
  parseDevinCatalogRates,
  parseRateTable,
  serializeRateTable,
  type RateTable,
  type SerializedRateTable,
} from "./pricing";

export const LITELLM_RATES_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

/** Rates move rarely; a day-old table keeps the dialog working offline. */
const RATES_TTL_MS = 24 * 60 * 60 * 1000;

/** An explicit refresh ignores the TTL, but not a table fetched this recently. */
const RATES_REFRESH_FLOOR_MS = 60 * 1000;

export interface UsagePricingInfo {
  status: "fresh" | "cached" | "unavailable";
  fetchedAtMs: number | null;
  knownModels: number;
}

export interface UsageRates {
  rates: RateTable;
  /** Devin's advertised rates, consulted first for Devin records. */
  devinRates: RateTable;
  pricing: UsagePricingInfo;
}

interface PersistedRates {
  fetchedAtMs: number;
  rates: SerializedRateTable;
}

const store = openDocumentStore("usage-history.json");

/** One cached, TTL-refreshed rate table backed by a store key. */
function rateSource(key: string, fetchTable: () => Promise<RateTable>) {
  let table: RateTable = new Map();
  let fetchedAtMs: number | null = null;
  let status: UsagePricingInfo["status"] = "unavailable";
  let loadedFromDisk = false;

  async function load(force: boolean): Promise<void> {
    const now = Date.now();
    const maxAgeMs = force ? RATES_REFRESH_FLOOR_MS : RATES_TTL_MS;
    if (fetchedAtMs !== null && now - fetchedAtMs < maxAgeMs) return;

    if (!loadedFromDisk) {
      loadedFromDisk = true;
      const persisted = await store.get<PersistedRates>(key).catch(() => undefined);
      const restored = deserializeRateTable(persisted?.rates);
      if (persisted && restored.size > 0) {
        table = restored;
        fetchedAtMs = persisted.fetchedAtMs;
        status = "cached";
        if (now - persisted.fetchedAtMs < maxAgeMs) return;
      }
    }

    let parsed: RateTable;
    try {
      parsed = await fetchTable();
    } catch {
      // Whatever we are serving is now past its TTL and must not claim freshness.
      if (table.size > 0) status = "cached";
      return;
    }
    if (parsed.size === 0) return;

    table = parsed;
    fetchedAtMs = now;
    status = "fresh";
    try {
      await store.set(key, { fetchedAtMs: now, rates: serializeRateTable(parsed) });
      await store.save();
    } catch {
      // An unwritable snapshot means a refetch next launch, not a failed read.
    }
  }

  return {
    load,
    get table() {
      return table;
    },
    get info(): UsagePricingInfo {
      return { status, fetchedAtMs, knownModels: table.size };
    },
  };
}

const liteLlm = rateSource("rates", async () =>
  parseRateTable(await fetchJson<unknown>(LITELLM_RATES_URL)),
);
const devin = rateSource("devinRates", async () =>
  parseDevinCatalogRates(JSON.parse(await readDevinModelCatalog())),
);

let inflight: Promise<unknown> | null = null;

/** Current rate tables, refreshed when past their TTL (or `force`d past the
 *  refresh floor). Never throws. Concurrent callers share one fetch. The
 *  reported provenance is LiteLLM's, which prices most models. */
export async function loadUsageRates(force = false): Promise<UsageRates> {
  while (inflight) await inflight;
  inflight = Promise.all([liteLlm.load(force), devin.load(force)]).finally(() => {
    inflight = null;
  });
  await inflight;
  const info = liteLlm.info;
  return {
    rates: liteLlm.table,
    devinRates: devin.table,
    pricing: { ...info, knownModels: info.knownModels + devin.table.size },
  };
}
