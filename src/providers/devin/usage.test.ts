import { describe, expect, it } from "vitest";
import { formatDollars, quotaWindow, snapshotFromUserStatus } from "./usage";

/** Shaped after a real `GetUserStatus` reply: int64 fields arrive as strings. */
function userStatus(planStatus: Record<string, unknown>) {
  return { userStatus: { planStatus: { planInfo: { planName: "Teams" }, ...planStatus } } };
}

describe("quotaWindow", () => {
  it("treats an omitted remaining-percent as fully spent", () => {
    // proto3 drops zero values, so "no percent" next to a live reset stamp
    // means 0% remaining — not "unknown".
    expect(quotaWindow("Daily", undefined, "1789459200")).toEqual({
      label: "Daily",
      usedPercent: 100,
      resetsAt: 1_789_459_200_000,
    });
  });

  it("converts remaining percent to used percent", () => {
    expect(quotaWindow("Weekly", 35, "1789891200")?.usedPercent).toBe(65);
    expect(quotaWindow("Weekly", 100, "1789891200")?.usedPercent).toBe(0);
  });

  it("omits a window the plan does not have", () => {
    expect(quotaWindow("Daily", undefined, undefined)).toBeUndefined();
  });

  it("accepts numeric unix seconds as well as strings", () => {
    expect(quotaWindow("Daily", 10, 1_789_459_200)?.resetsAt).toBe(1_789_459_200_000);
  });

  it("clamps out-of-range percentages", () => {
    expect(quotaWindow("Daily", 140, "1")?.usedPercent).toBe(0);
    expect(quotaWindow("Daily", -20, "1")?.usedPercent).toBe(100);
  });
});

describe("formatDollars", () => {
  it("renders micros as dollars", () => {
    expect(formatDollars(20_615_663)).toBe("$20.62");
    expect(formatDollars(0)).toBe("$0.00");
  });
});

describe("snapshotFromUserStatus", () => {
  it("maps an exhausted Teams plan the way the CLI reports it", () => {
    const snapshot = snapshotFromUserStatus(
      userStatus({
        dailyQuotaResetAtUnix: "1789459200",
        weeklyQuotaResetAtUnix: "1789891200",
        overageBalanceMicros: "20615663",
      }),
    );
    expect(snapshot.planLabel).toBe("Teams");
    expect(snapshot.windows).toEqual([
      { label: "Daily", usedPercent: 100, resetsAt: 1_789_459_200_000 },
      { label: "Weekly", usedPercent: 100, resetsAt: 1_789_891_200_000 },
      { label: "Extra usage balance", detail: "$20.62" },
    ]);
  });

  it("keeps partially used quotas distinct", () => {
    const snapshot = snapshotFromUserStatus(
      userStatus({
        dailyQuotaRemainingPercent: 62.5,
        dailyQuotaResetAtUnix: "1789459200",
        weeklyQuotaRemainingPercent: 88,
        weeklyQuotaResetAtUnix: "1789891200",
      }),
    );
    expect(snapshot.windows.map((w) => w.usedPercent)).toEqual([37.5, 12]);
  });

  it("reports ACU meters when the plan bills that way", () => {
    const snapshot = snapshotFromUserStatus(userStatus({ acuConsumed: "30", acuLimit: "120" }));
    expect(snapshot.windows[0]).toEqual({ label: "ACUs", usedPercent: 25, detail: "30 of 120" });
  });

  it("hides a zero overage balance", () => {
    const snapshot = snapshotFromUserStatus(
      userStatus({ dailyQuotaResetAtUnix: "1789459200", overageBalanceMicros: "0" }),
    );
    expect(snapshot.windows.some((w) => w.label === "Extra usage balance")).toBe(false);
  });

  it("falls back to a placeholder when the plan reports nothing", () => {
    const snapshot = snapshotFromUserStatus({ userStatus: {} });
    expect(snapshot.planLabel).toBeUndefined();
    expect(snapshot.windows).toEqual([{ label: "Usage", detail: "No quota data reported" }]);
  });
});
