import { describe, expect, it } from "vitest";

import { createUsageService } from "./service";
import type { AccountPublic, UsageResult } from "./types";

function account(id: string): AccountPublic {
  return {
    id,
    provider: "claude",
    label: id,
    hasCredential: true,
    hidden: false,
  };
}

function result(pct: number): UsageResult {
  return {
    snapshot: { windows: [{ label: "Session", usedPercent: pct }], fetchedAt: Date.now() },
    cached: false,
    stale: false,
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

describe("usage service", () => {
  it("loads an account into ok state", async () => {
    const service = createUsageService(async () => result(50));
    await service.getState().load("a");
    const state = service.getState().states.a;
    expect(state.status).toBe("ok");
    expect(state.status === "ok" && state.result.snapshot.windows[0].usedPercent).toBe(50);
  });

  it("keeps the previous result visible through a refresh", async () => {
    const second = deferred<UsageResult>();
    let calls = 0;
    const service = createUsageService(() =>
      calls++ === 0 ? Promise.resolve(result(50)) : second.promise,
    );
    await service.getState().load("a");

    const pending = service.getState().load("a", true);
    const state = service.getState().states.a;
    if (state.status !== "loading") throw new Error("expected loading state");
    expect(state.previous?.snapshot.windows[0].usedPercent).toBe(50);

    second.resolve(result(60));
    await pending;
  });

  it("preserves prior data across a failing reload", async () => {
    let fail = false;
    const service = createUsageService(async () => {
      if (fail) throw new Error("offline");
      return result(50);
    });
    await service.getState().load("a");

    fail = true;
    await service.getState().load("a", true);

    const state = service.getState().states.a;
    expect(state.status).toBe("error");
    if (state.status === "error") {
      expect(state.message).toBe("offline");
      expect(state.previous?.snapshot.windows[0].usedPercent).toBe(50);
    }
  });

  it("refreshAll reports refreshing until every account settles", async () => {
    const pending = deferred<UsageResult>();
    const service = createUsageService(() => pending.promise);
    const run = service.getState().refreshAll([account("a"), account("b")], true);
    expect(service.getState().refreshingAll).toBe(true);
    pending.resolve(result(10));
    await run;
    expect(service.getState().refreshingAll).toBe(false);
  });

  it("refreshAll is a no-op with no accounts", async () => {
    const service = createUsageService(async () => result(1));
    await service.getState().refreshAll([]);
    expect(service.getState().refreshingAll).toBe(false);
  });

  it("ensureLoaded only fetches accounts without state", async () => {
    const fetched: string[] = [];
    const service = createUsageService(async (id) => {
      fetched.push(id);
      return result(1);
    });
    service.getState().ensureLoaded([account("a"), account("b")]);
    await Promise.resolve();
    service.getState().ensureLoaded([account("a"), account("b"), account("c")]);
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(fetched).toEqual(["a", "b", "c"]);
  });

  it("forget drops a removed account's state; reset clears all", async () => {
    const service = createUsageService(async () => result(1));
    await service.getState().refreshAll([account("a"), account("b")]);
    service.getState().forget("a");
    expect(service.getState().states.a).toBeUndefined();
    expect(service.getState().states.b?.status).toBe("ok");
    service.getState().reset();
    expect(service.getState().states).toEqual({});
  });
});
