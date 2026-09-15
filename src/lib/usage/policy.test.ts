import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Account } from "../../contracts/accounts";
import type { UsageSnapshot } from "../../contracts/usage";

vi.mock("../../providers/registry", () => ({
  fetchProviderUsage: vi.fn(),
}));

import { fetchProviderUsage } from "../../providers/registry";
import { fetchUsage } from "./policy";

const mockedFetch = vi.mocked(fetchProviderUsage);

// The module-level snapshot/inflight maps persist across tests — each test
// uses its own account id so a cached result never bleeds over.
function account(id: string): Account {
  return {
    id,
    provider: "claude",
    label: id,
    auth: { kind: "pasted", credential: "token" },
    hidden: false,
  };
}

function snapshot(usedPercent = 50): UsageSnapshot {
  return {
    windows: [{ label: "Current session", usedPercent }],
    fetchedAt: Date.now(),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A fetch that never settles — the stalled-request case. */
function hung(): Promise<UsageSnapshot> {
  return new Promise<UsageSnapshot>(() => {});
}

describe("fetchUsage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the provider snapshot", async () => {
    mockedFetch.mockResolvedValue(snapshot(42));
    const result = await fetchUsage(account("plain"));
    expect(result.snapshot.windows[0].usedPercent).toBe(42);
    expect(result.cached).toBe(false);
  });

  it("serves the cached snapshot inside the TTL without refetching", async () => {
    mockedFetch.mockResolvedValue(snapshot(42));
    await fetchUsage(account("cached"));
    const result = await fetchUsage(account("cached"));
    expect(result.cached).toBe(true);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it("shares one in-flight fetch between callers", async () => {
    const pending = deferred<UsageSnapshot>();
    mockedFetch.mockReturnValue(pending.promise);
    const first = fetchUsage(account("shared"));
    const second = fetchUsage(account("shared"));
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    pending.resolve(snapshot(7));
    expect((await first).snapshot.windows[0].usedPercent).toBe(7);
    expect((await second).snapshot.windows[0].usedPercent).toBe(7);
  });

  it("times out a fetch that never settles instead of loading forever", async () => {
    mockedFetch.mockReturnValue(hung());
    const pending = fetchUsage(account("stuck"));
    const assertion = expect(pending).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(90_000);
    await assertion;
  });

  it("frees the inflight slot on timeout so a retry really retries", async () => {
    mockedFetch.mockReturnValueOnce(hung());
    const pending = fetchUsage(account("retry"));
    const assertion = expect(pending).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(90_000);
    await assertion;

    mockedFetch.mockResolvedValueOnce(snapshot(9));
    const result = await fetchUsage(account("retry"), { force: true });
    expect(result.snapshot.windows[0].usedPercent).toBe(9);
    expect(mockedFetch).toHaveBeenCalledTimes(2);
  });

  it("still caches a snapshot that lands after its own timeout", async () => {
    const pending = deferred<UsageSnapshot>();
    mockedFetch.mockReturnValueOnce(pending.promise);
    const timedOut = fetchUsage(account("late"));
    const assertion = expect(timedOut).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(90_000);
    await assertion;

    // The stalled fetch eventually succeeds — its snapshot should be kept.
    pending.resolve(snapshot(31));
    await pending.promise;

    const result = await fetchUsage(account("late"));
    expect(result.cached).toBe(true);
    expect(result.snapshot.windows[0].usedPercent).toBe(31);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });
});
