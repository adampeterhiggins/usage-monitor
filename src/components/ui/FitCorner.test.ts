import { describe, expect, it } from "vitest";

// Same raw-source pattern as src/testing/mock-commands.test.ts — keeps the
// check in the node test environment without a DOM.
const SOURCES: Record<string, string> = import.meta.glob("./*.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
});

// macOS claims ~15px at each corner of a borderless `.resizable` window for
// native resize hit-testing (NSWindow._resizeDirectionForMouseLocation), so
// pointer events there never reach the webview. The fit grip has to sit
// further in than that zone or real clicks die before reaching the button.
const MIN_CORNER_CLEARANCE_PX = 20;

function offsetPx(className: string, axis: "bottom" | "right"): number {
  const named = className.match(new RegExp(`${axis}-(\\d+)`));
  if (named) return Number(named[1]) * 4; // Tailwind spacing step = 4px
  const arbitrary = className.match(new RegExp(`${axis}-\\[(\\d+)px\\]`));
  return arbitrary ? Number(arbitrary[1]) : 0;
}

describe("FitCorner placement", () => {
  it("keeps the grip outside the native corner-resize zone", () => {
    const source = SOURCES["./FitCorner.tsx"];
    const className = source.match(/className="([^"]*fit-corner[^"]*)"/)?.[1] ?? "";
    expect(offsetPx(className, "bottom")).toBeGreaterThanOrEqual(MIN_CORNER_CLEARANCE_PX);
    expect(offsetPx(className, "right")).toBeGreaterThanOrEqual(MIN_CORNER_CLEARANCE_PX);
  });
});
