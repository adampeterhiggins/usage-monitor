import { beforeEach, describe, expect, it, vi } from "vitest";

type ListenFn = (event: string, handler: () => void) => Promise<() => void>;

const listenMock = vi.fn<ListenFn>();
const emitMock = vi.fn<(event: string, payload: unknown) => Promise<void>>();

vi.mock("@tauri-apps/api/event", () => ({
  listen: (event: string, handler: () => void) => listenMock(event, handler),
  emit: (event: string, payload: unknown) => emitMock(event, payload),
}));

import { emitEvent, subscribe } from "./events";

beforeEach(() => {
  listenMock.mockReset();
  emitMock.mockReset();
});

describe("subscribe", () => {
  it("fires the handler until disposed", async () => {
    let handler: (() => void) | undefined;
    listenMock.mockImplementation(async (_e, h) => {
      handler = h;
      return () => {};
    });
    const cb = vi.fn();
    const dispose = subscribe("test:event", cb);
    await Promise.resolve();

    handler!();
    expect(cb).toHaveBeenCalledTimes(1);

    dispose();
    handler!();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("unlistens immediately when disposed before registration resolves", async () => {
    const unlisten = vi.fn();
    let resolveListen!: (fn: () => void) => void;
    listenMock.mockImplementation(
      () => new Promise<() => void>((res) => (resolveListen = res)),
    );

    const dispose = subscribe("test:event", () => {});
    dispose();
    resolveListen(unlisten);
    await Promise.resolve();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("cleanup is idempotent", async () => {
    const unlisten = vi.fn();
    listenMock.mockResolvedValue(unlisten);
    const dispose = subscribe("test:event", () => {});
    await Promise.resolve();
    dispose();
    dispose();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("registration failure does not throw", async () => {
    listenMock.mockRejectedValue(new Error("no channel"));
    const dispose = subscribe("test:event", () => {});
    await Promise.resolve();
    expect(() => dispose()).not.toThrow();
  });
});

describe("emitEvent", () => {
  it("emits a null payload when none is given", async () => {
    emitMock.mockResolvedValue();
    await emitEvent("test:event");
    expect(emitMock).toHaveBeenCalledWith("test:event", null);
  });
});
