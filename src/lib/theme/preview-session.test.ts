import { describe, expect, it, vi } from "vitest";

import {
  createThemePreviewCoordinator,
  type ThemePreviewEffects,
} from "./preview-session";
import type { ThemeColors } from "./types";

const PAINT = { colors: {} as ThemeColors, appearance: "light" as const };
const PAINT_DARK = { colors: {} as ThemeColors, appearance: "dark" as const };

function makeEffects() {
  return {
    apply: vi.fn(),
    restore: vi.fn(async () => {}),
  } satisfies ThemePreviewEffects;
}

describe("theme preview coordinator", () => {
  it("applies paint for the active session only", () => {
    const effects = makeEffects();
    const coordinator = createThemePreviewCoordinator(effects);
    const session = coordinator.begin();

    expect(session.show(PAINT)).toBe(true);
    expect(effects.apply).toHaveBeenCalledWith(PAINT);
  });

  it("superseding aborts the old session and blocks its paints", () => {
    const effects = makeEffects();
    const coordinator = createThemePreviewCoordinator(effects);
    const first = coordinator.begin();
    const second = coordinator.begin();

    expect(first.signal.aborted).toBe(true);
    expect(first.isActive()).toBe(false);
    expect(first.show(PAINT)).toBe(false);
    expect(effects.apply).not.toHaveBeenCalled();
    expect(second.isActive()).toBe(true);
  });

  it("a superseded owner's cleanup cannot restore over a newer draft", async () => {
    const effects = makeEffects();
    const coordinator = createThemePreviewCoordinator(effects);
    const marketplace = coordinator.begin();
    const editor = coordinator.begin();

    await marketplace.end({ restore: true });
    expect(effects.restore).not.toHaveBeenCalled();

    await editor.end({ restore: true });
    expect(effects.restore).toHaveBeenCalledTimes(1);
  });

  it("ending without restore leaves the document alone", async () => {
    const effects = makeEffects();
    const coordinator = createThemePreviewCoordinator(effects);
    const session = coordinator.begin();
    await session.end();
    expect(effects.restore).not.toHaveBeenCalled();
    expect(coordinator.active()).toBeNull();
  });

  it("repaints the last draft instead of persisted state", () => {
    const effects = makeEffects();
    const coordinator = createThemePreviewCoordinator(effects);

    expect(coordinator.repaint()).toBe(false);

    const session = coordinator.begin();
    session.show(PAINT);
    session.show(PAINT_DARK);
    effects.apply.mockClear();

    expect(coordinator.repaint()).toBe(true);
    expect(effects.apply).toHaveBeenCalledWith(PAINT_DARK);
  });

  it("a second end() is a no-op", async () => {
    const effects = makeEffects();
    const coordinator = createThemePreviewCoordinator(effects);
    const session = coordinator.begin();
    await session.end({ restore: true });
    await session.end({ restore: true });
    expect(effects.restore).toHaveBeenCalledTimes(1);
  });
});
