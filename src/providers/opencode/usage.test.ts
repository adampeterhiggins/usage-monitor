import { describe, expect, it } from "vitest";
import { openCodeApiKey, parseOpenCodeAuthJson } from "./auth";
import { snapshotFromGoUsage } from "./usage";

describe("snapshotFromGoUsage", () => {
  it("maps the rolling, weekly and monthly windows", () => {
    const snapshot = snapshotFromGoUsage({
      usage: {
        rolling: { percent: 22, resetsAt: "2026-10-08T20:00:00.000Z" },
        weekly: { percent: 48.5, resetsAt: "2026-10-12T00:00:00.000Z" },
        monthly: { percent: 120, resetsAt: "2026-11-01T00:00:00.000Z" },
      },
    });
    expect(snapshot.planLabel).toBe("Go");
    expect(snapshot.windows).toEqual([
      { label: "Session", usedPercent: 22, resetsAt: Date.parse("2026-10-08T20:00:00.000Z") },
      { label: "Weekly", usedPercent: 48.5, resetsAt: Date.parse("2026-10-12T00:00:00.000Z") },
      { label: "Monthly", usedPercent: 100, resetsAt: Date.parse("2026-11-01T00:00:00.000Z") },
    ]);
  });

  it("skips a window with no percent and says so when nothing is left", () => {
    expect(snapshotFromGoUsage({ usage: { weekly: { percent: 10 } } }).windows).toEqual([
      { label: "Weekly", usedPercent: 10, resetsAt: undefined },
    ]);
    expect(snapshotFromGoUsage({}).windows).toEqual([{ label: "Usage", detail: "No quota data reported" }]);
  });
});

describe("OpenCode credentials", () => {
  it("reads the opencode-go key from auth.json", () => {
    const raw = JSON.stringify({
      anthropic: { type: "oauth", access: "a" },
      "opencode-go": { type: "api", key: " sk-go " },
    });
    expect(parseOpenCodeAuthJson(raw, "auth.json")).toBe("sk-go");
  });

  it("explains when auth.json has no Go key", () => {
    const raw = JSON.stringify({ anthropic: { type: "oauth", access: "a" } });
    expect(() => parseOpenCodeAuthJson(raw, "auth.json")).toThrow(/no OpenCode Go key/);
  });

  it("accepts a bare key or the whole file", () => {
    expect(openCodeApiKey(" sk-go ", "Pasted")).toBe("sk-go");
    expect(openCodeApiKey(JSON.stringify({ "opencode-go": { type: "api", key: "k" } }), "Pasted")).toBe("k");
    expect(() => openCodeApiKey("two words", "Pasted")).toThrow(/not an OpenCode API key/);
  });
});
