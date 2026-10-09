import { describe, expect, it, vi } from "vitest";

import type { ResetCredits } from "../contracts/resets";
import {
  createResetCreditsService,
  hasNewResetCredits,
  type ResetCreditsDeps,
} from "./resetCredits";

function credits(availableCount: number): ResetCredits {
  return { availableCount, credits: [] };
}

function service(overrides: Partial<ResetCreditsDeps> = {}) {
  const deps: ResetCreditsDeps = {
    fetch: vi.fn(async () => credits(1)),
    readSeen: vi.fn(async () => ({})),
    writeSeen: vi.fn(async () => {}),
    ...overrides,
  };
  return { deps, store: createResetCreditsService(deps) };
}

function isNew(store: ReturnType<typeof service>["store"], accountId: string): boolean {
  return hasNewResetCredits(store.getState(), accountId);
}

describe("reset credits service", () => {
  it("fetches each account once per TTL unless forced", async () => {
    let now = 0;
    const { deps, store } = service({ now: () => now });

    await store.getState().refresh(["a", "a", "b"]);
    expect(deps.fetch).toHaveBeenCalledTimes(2);
    expect(store.getState().credits.a).toEqual(credits(1));

    now = 60_000;
    await store.getState().refresh(["a"]);
    expect(deps.fetch).toHaveBeenCalledTimes(2);

    await store.getState().refresh(["a"], true);
    expect(deps.fetch).toHaveBeenCalledTimes(3);
  });

  it("keeps the last known credits when a fetch fails", async () => {
    const fetch = vi.fn<(id: string) => Promise<ResetCredits>>().mockResolvedValueOnce(credits(2));
    fetch.mockRejectedValueOnce(new Error("offline"));
    const { store } = service({ fetch });

    await store.getState().refresh(["a"]);
    await store.getState().refresh(["a"], true);
    expect(store.getState().credits.a).toEqual(credits(2));
  });

  it("baselines the first read and flags credits granted after it", async () => {
    const fetch = vi.fn<(id: string) => Promise<ResetCredits>>().mockResolvedValueOnce(credits(1));
    fetch.mockResolvedValueOnce(credits(2));
    const { deps, store } = service({ fetch });

    await store.getState().refresh(["a"]);
    expect(isNew(store, "a")).toBe(false);
    expect(deps.writeSeen).toHaveBeenLastCalledWith({ a: 1 });

    await store.getState().refresh(["a"], true);
    expect(isNew(store, "a")).toBe(true);

    await store.getState().acknowledge("a");
    expect(isNew(store, "a")).toBe(false);
    expect(deps.writeSeen).toHaveBeenLastCalledWith({ a: 2 });
  });

  it("flags credits granted while the app was closed", async () => {
    const { store } = service({
      fetch: vi.fn(async () => credits(3)),
      readSeen: vi.fn(async () => ({ a: 1 })),
    });

    await store.getState().refresh(["a"]);
    expect(isNew(store, "a")).toBe(true);
  });

  it("lowers the baseline when a credit is spent so the next grant still alerts", async () => {
    const fetch = vi.fn<(id: string) => Promise<ResetCredits>>().mockResolvedValueOnce(credits(2));
    fetch.mockResolvedValueOnce(credits(1));
    const { store } = service({ fetch, readSeen: vi.fn(async () => ({ a: 2 })) });

    await store.getState().refresh(["a"]);
    await store.getState().refresh(["a"], true);
    expect(store.getState().seen.a).toBe(1);

    await store.getState().record("a", credits(2));
    expect(isNew(store, "a")).toBe(true);
  });
});
