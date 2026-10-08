import { describe, expect, it } from "vitest";

import { parseCedarEmber, parseJuniperTide, SESSION_RESET_ID, withSessionReset } from "./resets";

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

  it("reads as none when ineligible", () => {
    expect(parseCedarEmber(undefined, NOW)).toEqual({ availableCount: 0, credits: [] });
    expect(parseCedarEmber({ eligible: false, grants: [] }, NOW)).toEqual({
      availableCount: 0,
      credits: [],
    });
  });

  it("still lists banked grants when Claude names no next grant", () => {
    const parsed = parseCedarEmber(
      {
        eligible: true,
        next_grant_id: null,
        grants: [
          { id: "saved", resets_left: 1, usable_now: true, ends_at: "2026-10-22T00:00:00Z" },
          { id: "paused", resets_left: 1, usable_now: true, paused: true },
        ],
      },
      NOW,
    );
    expect(parsed.availableCount).toBe(1);
    expect(parsed.nextCreditId).toBeUndefined();
    expect(parsed.nextExpiresAt).toBe(Date.parse("2026-10-22T00:00:00Z"));
    expect(parsed.credits.map((credit) => credit.id)).toEqual(["saved", "paused"]);
  });

  it("names each grant by its label, or by the limits it clears", () => {
    const parsed = parseCedarEmber(
      {
        eligible: true,
        next_grant_id: "full",
        grants: [
          { id: "full", resets_left: 1, usable_now: true, clears: ["five_hour", "seven_day", "seven_day_omelette"] },
          { id: "session", resets_left: 1, usable_now: true, clears: ["five_hour"] },
          { id: "weekly", resets_left: 1, usable_now: true, clears: ["seven_day", "seven_day_opus"] },
          { id: "named", resets_left: 1, usable_now: true, label: " Welcome back ", clears: ["five_hour"] },
          { id: "bare", resets_left: 1, usable_now: true },
        ],
      },
      NOW,
    );
    expect(parsed.credits.map((credit) => [credit.id, credit.title, credit.refills])).toEqual([
      ["full", "Full reset", "5-hour and weekly limits"],
      ["session", "5-hour reset", "5-hour limit"],
      ["weekly", "Weekly reset", "weekly and Opus weekly limits"],
      ["named", "Welcome back", "5-hour limit"],
      ["bare", undefined, undefined],
    ]);
  });

  it("holds back grants that do not refill a limit the account is at, but counts them", () => {
    const parsed = parseCedarEmber(
      {
        eligible: true,
        next_grant_id: "full",
        exhausted: ["seven_day"],
        grants: [
          { id: "full", resets_left: 1, usable_now: true, clears: ["five_hour", "seven_day"] },
          { id: "session", resets_left: 1, usable_now: true, clears: ["five_hour"] },
          { id: "anytime", resets_left: 1, usable_now: true, clears: ["five_hour"], use_requires_limit: false },
        ],
      },
      NOW,
    );
    expect(parsed.availableCount).toBe(3);
    expect(parsed.nextCreditId).toBe("full");
    expect(parsed.credits.map((credit) => [credit.id, credit.usable, credit.blockedReason])).toEqual([
      ["full", true, undefined],
      ["session", false, "doesn't refill your weekly limit"],
      ["anytime", true, undefined],
    ]);
  });

  it("holds back limit-only grants while the account is at no limit", () => {
    const parsed = parseCedarEmber(
      {
        eligible: true,
        next_grant_id: null,
        exhausted: [],
        grants: [{ id: "full", resets_left: 1, usable_now: true, clears: ["five_hour", "seven_day"] }],
      },
      NOW,
    );
    expect(parsed.availableCount).toBe(1);
    expect(parsed.credits[0]).toMatchObject({ usable: false, blockedReason: "for use at a usage limit" });
  });

  it("leaves the claim to decide when Claude does not say which limits are hit", () => {
    const parsed = parseCedarEmber(
      {
        eligible: true,
        next_grant_id: "session",
        grants: [{ id: "session", resets_left: 1, usable_now: true, clears: ["five_hour"] }],
      },
      NOW,
    );
    expect(parsed.credits[0]).toMatchObject({ usable: true, blockedReason: undefined });
  });

  it("says when a grant that has not started becomes usable", () => {
    const parsed = parseCedarEmber(
      {
        eligible: true,
        grants: [{ id: "soon", resets_left: 1, usable_now: false, starts_at: "2026-09-30T00:00:00Z" }],
      },
      NOW,
    );
    expect(parsed.availableCount).toBe(0);
    expect(parsed.credits[0]).toMatchObject({
      usable: false,
      blockedReason: "not usable yet",
      usableAt: Date.parse("2026-09-30T00:00:00Z"),
    });
  });
});

describe("parseJuniperTide", () => {
  it("offers the session reset only to the reset arm", () => {
    expect(parseJuniperTide(undefined, NOW)).toBeUndefined();
    expect(parseJuniperTide({ eligible: false, ineligible_reason: "not_at_wall" }, NOW)).toBeUndefined();
    expect(parseJuniperTide({ eligible: true, arm: "control", available: true }, NOW)).toBeUndefined();
    expect(parseJuniperTide({ eligible: true, arm: "reset", available: true }, NOW)).toEqual({
      id: SESSION_RESET_ID,
      resetsLeft: 1,
      title: "5-hour reset",
      refills: "5-hour limit",
      usable: true,
      blockedReason: undefined,
      usableAt: undefined,
    });
  });

  it("lists a spent session reset with when the next one comes", () => {
    expect(
      parseJuniperTide(
        { eligible: true, arm: "reset", available: false, next_available_at: "2026-10-01T00:00:00Z" },
        NOW,
      ),
    ).toMatchObject({
      usable: false,
      blockedReason: "used this week",
      usableAt: Date.parse("2026-10-01T00:00:00Z"),
    });
  });

  it("counts the session reset alongside banked grants only when it is usable", () => {
    const banked = { availableCount: 2, nextCreditId: "g1", credits: [] };
    const session = parseJuniperTide({ eligible: true, arm: "reset", available: true }, NOW);
    expect(withSessionReset(banked, session)).toMatchObject({ availableCount: 3, nextCreditId: "g1" });
    expect(withSessionReset(banked, { ...session!, usable: false }).availableCount).toBe(2);
    expect(withSessionReset(banked, undefined)).toBe(banked);
  });
});
