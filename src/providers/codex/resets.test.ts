import { describe, expect, it } from "vitest";

import { parseCodexResetCredits } from "./resets";

describe("parseCodexResetCredits", () => {
  it("lists every available credit, soonest expiry first", () => {
    expect(
      parseCodexResetCredits({
        available_count: 2,
        credits: [
          { id: "a", status: "available", expires_at: "2026-10-22T00:00:00Z", title: " Bonus " },
          { id: "b", status: "available", expires_at: "2026-10-10T00:00:00Z" },
          { id: "c", status: "redeemed", expires_at: "2026-10-01T00:00:00Z" },
        ],
      }),
    ).toEqual({
      availableCount: 2,
      nextExpiresAt: Date.parse("2026-10-10T00:00:00Z"),
      credits: [
        { id: "b", resetsLeft: 1, expiresAt: Date.parse("2026-10-10T00:00:00Z"), title: undefined, usable: true },
        { id: "a", resetsLeft: 1, expiresAt: Date.parse("2026-10-22T00:00:00Z"), title: "Bonus", usable: true },
      ],
    });
  });

  it("puts credits without an expiry last", () => {
    const parsed = parseCodexResetCredits({
      available_count: 2,
      credits: [
        { id: "forever", status: "available", expires_at: null },
        { id: "soon", status: "available", expires_at: "2026-10-10T00:00:00Z" },
      ],
    });
    expect(parsed.credits.map((credit) => credit.id)).toEqual(["soon", "forever"]);
  });

  it("tolerates a count with no detail rows", () => {
    expect(parseCodexResetCredits({ available_count: 1, credits: null })).toEqual({
      availableCount: 1,
      nextExpiresAt: undefined,
      credits: [],
    });
    expect(parseCodexResetCredits({})).toEqual({
      availableCount: 0,
      nextExpiresAt: undefined,
      credits: [],
    });
  });
});
