import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { fetchJson, NetworkError } from "./http";

beforeEach(() => {
  invoke.mockReset();
});

describe("native HTTP failures", () => {
  it("rejects with NetworkError when the request never reached the server", async () => {
    invoke.mockRejectedValue({ kind: "network", message: "Request failed: dns error" });
    const error = await fetchJson("https://claude.ai/api").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NetworkError);
    expect((error as Error).message).toBe("Request failed: dns error");
  });

  it("rejects with a plain Error for other failures", async () => {
    invoke.mockRejectedValue({ kind: "request", message: "http_request is restricted" });
    const error = await fetchJson("https://claude.ai/api").catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(NetworkError);
    expect((error as Error).message).toBe("http_request is restricted");
  });
});
