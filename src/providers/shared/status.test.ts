import { describe, expect, it } from "vitest";

import { parseStatus } from "./status";

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
