import { describe, expect, it } from "vitest";

import { parseCedarEmber } from "./resets";

const NOW = Date.parse("2026-09-28T12:00:00Z");

describe("parseCedarEmber", () => {
  it("sums live grants, lists each one, and reports the next grant's expiry", () => {
    expect(
      parseCedarEmber(
        {
          eligible: true,
          next_grant_id: "g1",
          grants: [
            { id: "g2", resets_left: 2, usable_now: true },
            { id: "g1", resets_left: 1, usable_now: true, ends_at: "2026-10-20T00:00:00Z" },
          ],
        },
        NOW,
      ),
    ).toEqual({
      availableCount: 3,
      nextExpiresAt: Date.parse("2026-10-20T00:00:00Z"),
      nextCreditId: "g1",
      credits: [
        { id: "g1", resetsLeft: 1, expiresAt: Date.parse("2026-10-20T00:00:00Z"), usable: true },
        { id: "g2", resetsLeft: 2, expiresAt: undefined, usable: true },
      ],
    });
  });

  it("lists paused and not-yet-usable grants without counting them", () => {
    const parsed = parseCedarEmber(
      {
        eligible: true,
        next_grant_id: "live",
        grants: [
          { id: "live", resets_left: 1, usable_now: true },
          { id: "paused", resets_left: 1, usable_now: true, paused: true },
          { id: "later", resets_left: 1, usable_now: false },
          { id: "gone", resets_left: 1, usable_now: true, ends_at: "2026-09-01T00:00:00Z" },
          { id: "empty", resets_left: 0, usable_now: true },
          { id: "Bad Id!", resets_left: 1, usable_now: true },
        ],
      },
      NOW,
    );
    expect(parsed.availableCount).toBe(1);
    expect(parsed.credits.map((credit) => [credit.id, credit.usable])).toEqual([
      ["live", true],
      ["paused", false],
      ["later", false],
    ]);
  });

  it("reads as none when ineligible or the next grant is not live", () => {
    expect(parseCedarEmber(undefined, NOW)).toEqual({ availableCount: 0, credits: [] });
    expect(parseCedarEmber({ eligible: false, grants: [] }, NOW)).toEqual({
      availableCount: 0,
      credits: [],
    });
    expect(
      parseCedarEmber(
        {
          eligible: true,
          next_grant_id: "paused",
          grants: [{ id: "paused", resets_left: 1, usable_now: true, paused: true }],
        },
        NOW,
      ),
    ).toEqual({ availableCount: 0, credits: [] });
  });
});
