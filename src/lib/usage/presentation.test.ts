import { describe, expect, it } from "vitest";

import { severity, worstPercent } from "./presentation";

describe("severity", () => {
  it("maps percentages to severity bands", () => {
    expect(severity(undefined)).toBe("neutral");
    expect(severity(0)).toBe("ok");
    expect(severity(39.9)).toBe("ok");
    expect(severity(40)).toBe("warn");
    expect(severity(70)).toBe("high");
    expect(severity(90)).toBe("critical");
    expect(severity(100)).toBe("critical");
  });
});

describe("worstPercent", () => {
  it("returns the max used percent, ignoring missing values", () => {
    expect(worstPercent([])).toBeUndefined();
    expect(
      worstPercent([{ label: "a" }, { label: "b", usedPercent: 42 }, { label: "c", usedPercent: 7 }]),
    ).toBe(42);
  });
});
