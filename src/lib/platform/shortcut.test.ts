import { describe, expect, it } from "vitest";
import {
  acceleratorFromKeyDown,
  acceleratorGlyphs,
  formatAccelerator,
  toGlobalShortcut,
} from "./shortcut";

function keydown(init: Partial<KeyboardEvent> & { key: string }): KeyboardEvent {
  return init as KeyboardEvent;
}

describe("acceleratorFromKeyDown", () => {
  it("builds an accelerator from modifiers and a key", () => {
    expect(
      acceleratorFromKeyDown(keydown({ key: "u", code: "KeyU", metaKey: true, shiftKey: true })),
    ).toBe("Command+Shift+U");
  });

  it("orders modifiers Command, Control, Alt, Shift", () => {
    expect(
      acceleratorFromKeyDown(
        keydown({ key: "x", code: "KeyX", metaKey: true, ctrlKey: true, altKey: true, shiftKey: true }),
      ),
    ).toBe("Command+Control+Alt+Shift+X");
  });

  it("maps Enter to Return and arrows to Up/Down/etc", () => {
    expect(acceleratorFromKeyDown(keydown({ key: "Enter", metaKey: true }))).toBe("Command+Return");
    expect(acceleratorFromKeyDown(keydown({ key: "ArrowUp", metaKey: true }))).toBe("Command+Up");
  });

  it("uses event.code for letters, digits, and punctuation", () => {
    expect(acceleratorFromKeyDown(keydown({ key: "5", code: "Digit5", metaKey: true }))).toBe(
      "Command+5",
    );
    expect(acceleratorFromKeyDown(keydown({ key: ",", code: "Comma", metaKey: true }))).toBe(
      "Command+,",
    );
  });

  it("accepts function keys", () => {
    expect(acceleratorFromKeyDown(keydown({ key: "F5", metaKey: true }))).toBe("Command+F5");
  });

  it("returns null for modifier-only presses", () => {
    expect(acceleratorFromKeyDown(keydown({ key: "Shift", shiftKey: true }))).toBeNull();
    expect(acceleratorFromKeyDown(keydown({ key: "Meta", metaKey: true }))).toBeNull();
  });

  it("rejects bare keys unless allowed and whitelisted", () => {
    expect(acceleratorFromKeyDown(keydown({ key: "u", code: "KeyU" }))).toBeNull();
    expect(
      acceleratorFromKeyDown(keydown({ key: "u", code: "KeyU" }), { allowBareKey: true }),
    ).toBeNull();
    expect(
      acceleratorFromKeyDown(keydown({ key: "Enter" }), { allowBareKey: true }),
    ).toBe("Return");
    expect(
      acceleratorFromKeyDown(keydown({ key: "F9" }), { allowBareKey: true }),
    ).toBe("F9");
  });
});

describe("formatAccelerator", () => {
  it("renders modifiers as macOS glyphs", () => {
    expect(formatAccelerator("CommandOrControl+Shift+U")).toBe("⌘⇧U");
    expect(acceleratorGlyphs("Command+Return")).toEqual(["⌘", "⏎"]);
  });
});

describe("toGlobalShortcut", () => {
  it("rewrites Command to CommandOrControl", () => {
    expect(toGlobalShortcut("Command+Return")).toBe("CommandOrControl+Return");
    expect(toGlobalShortcut("Shift+Command+P")).toBe("Shift+CommandOrControl+P");
  });

  it("leaves other accelerators untouched", () => {
    expect(toGlobalShortcut("CommandOrControl+Shift+U")).toBe("CommandOrControl+Shift+U");
    expect(toGlobalShortcut("Alt+F4")).toBe("Alt+F4");
  });
});
