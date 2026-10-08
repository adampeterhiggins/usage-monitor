import { describe, expect, it, vi } from "vitest";

import type { ProviderStatus } from "../providers/shared/status";
import { createProviderStatusService } from "./providerStatus";

const DEGRADED: ProviderStatus = { indicator: "minor", description: "Partially Degraded Service" };

describe("provider status service", () => {
  it("fetches each provider once per TTL unless forced", async () => {
    let now = 0;
    const fetcher = vi.fn(async () => DEGRADED);
    const store = createProviderStatusService(fetcher, () => now);

    await store.getState().refresh(["claude", "claude", "codex"]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(store.getState().statuses.claude).toEqual(DEGRADED);

    now = 60_000;
    await store.getState().refresh(["claude"]);
    expect(fetcher).toHaveBeenCalledTimes(2);

    await store.getState().refresh(["claude"], true);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("keeps the last known status when a fetch fails", async () => {
    const fetcher = vi.fn<() => Promise<ProviderStatus>>().mockResolvedValueOnce(DEGRADED);
    fetcher.mockRejectedValueOnce(new Error("offline"));
    const store = createProviderStatusService(fetcher);

    await store.getState().refresh(["cursor"]);
    await store.getState().refresh(["cursor"], true);
    expect(store.getState().statuses.cursor).toEqual(DEGRADED);
  });
});
