import { describe, expect, it } from "vitest";
import type { PendingUpdate } from "../../contracts/platform";
import {
  describeUpdateError,
  formatBytes,
  formatPublished,
  installUpdate,
  updateBadge,
  type UpdateState,
} from "./service";

describe("formatBytes", () => {
  it("renders KB below a megabyte and MB above", () => {
    expect(formatBytes(0)).toBe("0 MB");
    expect(formatBytes(512 * 1024)).toBe("512 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5 MB");
  });
});

describe("formatPublished", () => {
  it("parses the updater's timestamp variants", () => {
    expect(formatPublished(null)).toBeNull();
    expect(formatPublished("2026-01-15T10:00:00Z")).toBe("15 Jan 2026");
    expect(formatPublished("2026-01-15 10:00:00 +00:00:00")).toBe("15 Jan 2026");
    expect(formatPublished("garbage")).toBeNull();
  });
});

describe("describeUpdateError", () => {
  it("translates known failure modes", () => {
    expect(describeUpdateError(new Error("404 not found"))).toContain("update manifest");
    expect(describeUpdateError(new Error("HTTP 403 forbidden"))).toContain("GitHub rejected");
    expect(describeUpdateError(new Error("invalid minisign signature"))).toContain("signature");
    expect(describeUpdateError(new Error("something else"))).toBe("something else");
  });
});

describe("installUpdate progress mapping", () => {
  function fakeUpdate(events: Parameters<PendingUpdate["downloadAndInstall"]>[0][] extends never ? never : import("../../contracts/platform").UpdateProgressEvent[]): PendingUpdate {
    return {
      currentVersion: "0.1.0",
      version: "0.2.0",
      notes: null,
      publishedAt: null,
      downloadAndInstall: async (onProgress) => {
        for (const e of events) onProgress(e);
      },
    };
  }

  it("maps started/progress/finished to byte counters and phases", async () => {
    const patches: Partial<UpdateState>[] = [];
    const update = fakeUpdate([
      { type: "started", contentLength: 100 },
      { type: "progress", chunkLength: 40 },
      { type: "progress", chunkLength: 60 },
      { type: "finished" },
    ]);
    await installUpdate(update, (p) => patches.push(p));

    expect(patches).toContainEqual({ totalBytes: 100, downloadedBytes: 0, progress: 0 });
    expect(patches).toContainEqual({ downloadedBytes: 40, progress: 0.4 });
    expect(patches).toContainEqual({ downloadedBytes: 100, progress: 1 });
    expect(patches[patches.length - 1]).toEqual({ phase: "ready", progress: 1 });
  });

  it("handles unknown content length with indeterminate progress", async () => {
    const patches: Partial<UpdateState>[] = [];
    await installUpdate(
      fakeUpdate([{ type: "started" }, { type: "progress", chunkLength: 10 }]),
      (p) => patches.push(p),
    );
    expect(patches).toContainEqual({ totalBytes: null, downloadedBytes: 0, progress: null });
    expect(patches).toContainEqual({ downloadedBytes: 10, progress: null });
  });
});

describe("updateBadge", () => {
  it("leads to the download while a release is pending", () => {
    expect(updateBadge({ phase: "available", availableVersion: "1.8.0" })).toBe("available");
    expect(updateBadge({ phase: "downloading", availableVersion: "1.8.0" })).toBe("available");
  });

  it("asks for a restart once the update is downloaded", () => {
    expect(updateBadge({ phase: "ready", availableVersion: "1.8.0" })).toBe("ready");
    expect(updateBadge({ phase: "installing", availableVersion: "1.8.0" })).toBe("ready");
  });

  it("keeps pointing at a release whose download failed", () => {
    expect(updateBadge({ phase: "error", availableVersion: "1.8.0" })).toBe("available");
    expect(updateBadge({ phase: "error", availableVersion: null })).toBeNull();
  });

  it("stays hidden when there is nothing to install", () => {
    for (const phase of ["idle", "checking", "up-to-date"] as const) {
      expect(updateBadge({ phase, availableVersion: null })).toBeNull();
    }
  });
});
