import { describe, expect, it } from "vitest";

// Same raw-source pattern as src/testing/mock-commands.test.ts — keeps the
// check in the node test environment without a DOM.
const SOURCES: Record<string, string> = import.meta.glob(
  ["./FitCorner.tsx", "../../index.css", "../../../src-tauri/src/macos.rs"],
  { query: "?raw", import: "default", eager: true },
);

// macOS claims ~15px at each corner of a borderless `.resizable` window for
// native resize hit-testing (NSWindow._resizeDirectionForMouseLocation), so
// pointer events there never reach the webview. macos.rs swizzles the claim
// away inside the fit button's rect — the button must stay flush at
// bottom-0 right-0 and 24px square for the reclaimed region to line up.
describe("FitCorner placement", () => {
  it("keeps the grip flush in the reclaimed corner", () => {
    const source = SOURCES["./FitCorner.tsx"];
    const className = source.match(/className="([^"]*fit-corner[^"]*)"/)?.[1] ?? "";
    expect(className).toContain("bottom-0");
    expect(className).toContain("right-0");
  });

  it("keeps the button footprint in sync with the native reclaim rect", () => {
    const css = SOURCES["../../index.css"];
    const rule = css.match(/\.fit-corner\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/width:\s*24px/);
    expect(rule).toMatch(/height:\s*24px/);
    const macos = SOURCES["../../../src-tauri/src/macos.rs"];
    expect(macos).toContain("FIT_CORNER_SIZE: f64 = 24.0");
  });
});
