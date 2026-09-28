import { describe, expect, it } from "vitest";

import { parseCodexResetCredits } from "./resets";

describe("parseCodexResetCredits", () => {
  it("reports the soonest expiry among available credits", () => {
    expect(
      parseCodexResetCredits({
        available_count: 2,
        credits: [
          { id: "a", status: "available", expires_at: "2026-10-22T00:00:00Z" },
          { id: "b", status: "available", expires_at: "2026-10-10T00:00:00Z" },
          { id: "c", status: "redeemed", expires_at: "2026-10-01T00:00:00Z" },
        ],
      }),
    ).toEqual({ availableCount: 2, nextExpiresAt: Date.parse("2026-10-10T00:00:00Z") });
  });

  it("tolerates a count with no detail rows", () => {
    expect(parseCodexResetCredits({ available_count: 1, credits: null })).toEqual({
      availableCount: 1,
      nextExpiresAt: undefined,
    });
    expect(parseCodexResetCredits({})).toEqual({ availableCount: 0, nextExpiresAt: undefined });
  });
});
