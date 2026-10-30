import { beforeEach, describe, expect, it, vi } from "vitest";
import nativeHttp from "../../../src-tauri/src/http.rs?raw";

import { PROVIDER_IDS } from "../../contracts/providers";
import { fetchJson, fetchText } from "../../platform/http";
import { fetchProviderStatus, parseStatus, parseXaiStatus, STATUS_PAGES } from "./status";

vi.mock("../../platform/http", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../platform/http")>(),
  fetchJson: vi.fn(),
  fetchText: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

describe("parseStatus", () => {
  it("reads the Statuspage indicator and description", () => {
    expect(
      parseStatus({ status: { indicator: "major", description: "Partial System Outage" } }),
    ).toEqual({ indicator: "major", description: "Partial System Outage" });
  });

  it("treats an unknown indicator as an issue rather than all clear", () => {
    expect(parseStatus({ status: { indicator: "degraded", description: "" } })).toEqual({
      indicator: "minor",
      description: "Service issue reported",
    });
  });

  it("rejects a response with no indicator", () => {
    expect(() => parseStatus({ page: {} })).toThrow();
  });
});

const feed = (...items: string[]) =>
  `<rss version="2.0"><channel><title>xAI System Status</title>${items.join("")}</channel></rss>`;
const incident = (severity: string, state: string, title = "Grok issue", link = "") =>
  `<item><title>${title}</title>${link ? `<link>${link}</link>` : ""}<category>${severity}</category><category>${state}</category></item>`;
const parseGrokStatus = (xml: string) => parseXaiStatus(xml, "grok");

describe("parseXaiStatus", () => {
  it("ignores resolved history and accepts an empty feed", () => {
    for (const xml of [feed(), feed(incident("outage", "resolved"))]) {
      expect(parseGrokStatus(xml)).toEqual({ indicator: "none", description: "All Systems Operational" });
    }
  });

  it("chooses the most severe active incident and decodes its title", () => {
    expect(parseGrokStatus(feed(
      incident("outage", "resolved", "Old outage"),
      incident("disruption", "monitoring", "Degraded service"),
      incident("outage", "investigating", "Grok &amp; API outage"),
    ))).toEqual({ indicator: "major", description: "Grok & API outage" });
  });

  it.each([
    ["disruption", "minor"], ["info", "minor"], ["maintenance", "maintenance"], ["unexpected", "minor"],
  ])("maps %s severity conservatively", (severity, indicator) => {
    expect(parseGrokStatus(feed(incident(severity, "investigating"))).indicator).toBe(indicator);
  });

  it("separates Cursor incidents from the rest of xAI", () => {
    const xml = feed(
      incident("outage", "investigating", "[Grok (Build)] Grok outage", "https://status.x.ai/grok-build/INC1"),
      incident("disruption", "investigating", "[Cursor] Slow completions", "https://status.x.ai/cursor/INC2"),
      incident("outage", "resolved", "[Cursor (Agents)] Old outage", "https://status.x.ai/cursor-agents/INC3"),
      incident("maintenance", "monitoring", "Untagged title", "https://status.x.ai/cursor-tab/INC4"),
    );
    expect(parseXaiStatus(xml, "grok")).toEqual({ indicator: "major", description: "[Grok (Build)] Grok outage" });
    expect(parseXaiStatus(xml, "cursor")).toEqual({ indicator: "minor", description: "[Cursor] Slow completions" });
    expect(parseXaiStatus(feed(incident("outage", "investigating")), "cursor").indicator).toBe("none");
  });

  it("rejects blocked, malformed, and structurally incomplete replies", () => {
    for (const xml of ["<html>Blocked</html>", "<rss><channel>", "{}", feed("<item><title>Missing state</title></item>")]) {
      expect(() => parseGrokStatus(xml)).toThrow();
    }
  });
});

describe("provider status routing", () => {
  it("explicitly declares status support for every provider", () => {
    expect(Object.keys(STATUS_PAGES).sort()).toEqual([...PROVIDER_IDS].sort());
    for (const page of Object.values(STATUS_PAGES)) {
      if (page) expect(nativeHttp).toContain(`"${new URL(page).hostname}"`);
    }
  });

  it.each(["claude", "codex", "devin"] as const)("fetches %s using Statuspage", async (provider) => {
    vi.mocked(fetchJson).mockResolvedValue({ status: { indicator: "none" } });
    expect((await fetchProviderStatus(provider)).indicator).toBe("none");
    expect(fetchJson).toHaveBeenCalledWith(`${STATUS_PAGES[provider]}/api/v2/status.json`);
    expect(fetchText).not.toHaveBeenCalled();
  });

  it("fetches Grok using its documented RSS feed", async () => {
    vi.mocked(fetchText).mockResolvedValue({ status: 200, headers: {}, body: feed(incident("disruption", "investigating")) });
    expect((await fetchProviderStatus("grok")).indicator).toBe("minor");
    expect(fetchText).toHaveBeenCalledWith("https://status.x.ai/feed.xml", { headers: { Accept: "application/rss+xml" } });
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it("rejects HTTP failures even if the body looks like a valid feed", async () => {
    vi.mocked(fetchText).mockResolvedValue({ status: 503, headers: {}, body: feed() });
    await expect(fetchProviderStatus("grok")).rejects.toThrow("Couldn’t fetch xAI status feed");
  });

  it("reports the worse of Cursor's xAI feed and its retiring Statuspage", async () => {
    vi.mocked(fetchText).mockResolvedValue({
      status: 200, headers: {}, body: feed(incident("disruption", "investigating", "[Cursor] Slow completions")),
    });
    vi.mocked(fetchJson).mockResolvedValue({ status: { indicator: "major", description: "Partial System Outage" } });
    expect(await fetchProviderStatus("cursor")).toEqual({ indicator: "major", description: "Partial System Outage" });
    expect(fetchText).toHaveBeenCalledWith("https://status.x.ai/feed.xml", { headers: { Accept: "application/rss+xml" } });
    expect(fetchJson).toHaveBeenCalledWith("https://status.cursor.com/api/v2/status.json");
    expect(nativeHttp).toContain('"status.cursor.com"');
  });

  it("falls back to whichever Cursor status source still answers", async () => {
    vi.mocked(fetchText).mockResolvedValue({
      status: 200, headers: {}, body: feed(incident("disruption", "investigating", "[Cursor] Slow completions")),
    });
    vi.mocked(fetchJson).mockRejectedValue(new Error("gone"));
    expect((await fetchProviderStatus("cursor")).indicator).toBe("minor");

    vi.mocked(fetchText).mockResolvedValue({ status: 503, headers: {}, body: "" });
    await expect(fetchProviderStatus("cursor")).rejects.toThrow("Couldn’t fetch xAI status feed");
  });

  it("does not invent a health check for OpenCode", async () => {
    await expect(fetchProviderStatus("opencode")).rejects.toThrow("no status page");
    expect(fetchJson).not.toHaveBeenCalled();
    expect(fetchText).not.toHaveBeenCalled();
  });
});
