import { describe, expect, it } from "vitest";
import { describeUpdateError, formatBytes, formatPublished } from "./api";

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
