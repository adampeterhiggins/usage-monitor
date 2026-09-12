import { beforeEach, describe, expect, it, vi } from "vitest";

const setSize = vi.fn();
const setPosition = vi.fn();

const windowState = vi.hoisted(() => ({
  factor: 1,
  inner: { width: 820, height: 480 },
  outer: { width: 820, height: 480 },
  position: { x: 100, y: 80 },
  monitor: {
    position: { x: 0, y: 0 },
    size: { width: 1440, height: 900 },
  } as { position: { x: number; y: number }; size: { width: number; height: number } } | null,
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("./events", () => ({ subscribe: vi.fn() }));
vi.mock("@tauri-apps/api/window", () => ({
  LogicalSize: class {
    constructor(
      public width: number,
      public height: number,
    ) {}
  },
  LogicalPosition: class {
    constructor(
      public x: number,
      public y: number,
    ) {}
  },
  currentMonitor: async () => windowState.monitor,
  getCurrentWindow: () => ({
    label: "main",
    scaleFactor: async () => windowState.factor,
    innerSize: async () => windowState.inner,
    outerSize: async () => windowState.outer,
    outerPosition: async () => windowState.position,
    setSize,
    setPosition,
  }),
}));

import {
  clampPanelHeightToDisplay,
  DEFAULT_PANEL_HEIGHT,
  DEFAULT_PANEL_WIDTH,
  defaultPanelFrameOnDisplay,
  fitPanelToContent,
  restoreDefaultPanelSize,
} from "./windows";

beforeEach(() => {
  setSize.mockReset();
  setPosition.mockReset();
  windowState.factor = 1;
  windowState.inner = { width: 820, height: 480 };
  windowState.outer = { width: 820, height: 480 };
  windowState.position = { x: 100, y: 80 };
  windowState.monitor = {
    position: { x: 0, y: 0 },
    size: { width: 1440, height: 900 },
  };
});

describe("clampPanelHeightToDisplay", () => {
  it("leaves a short panel alone", () => {
    expect(clampPanelHeightToDisplay(400, 80, 900)).toBe(400);
  });

  it("caps height so the bottom stays on the display", () => {
    expect(clampPanelHeightToDisplay(2000, 80, 900)).toBe(820);
  });

  it("subtracts window chrome from the available height", () => {
    expect(clampPanelHeightToDisplay(2000, 80, 900, 20)).toBe(800);
  });

  it("will shrink below the minimum when the remaining strip is tiny", () => {
    expect(clampPanelHeightToDisplay(400, 850, 900)).toBe(50);
  });
});

describe("defaultPanelFrameOnDisplay", () => {
  const display = { left: 0, top: 0, right: 1440, bottom: 900 };

  it("keeps the current origin when the default size already fits", () => {
    expect(defaultPanelFrameOnDisplay({ x: 120, y: 80 }, display)).toEqual({
      x: 120,
      y: 80,
      width: DEFAULT_PANEL_WIDTH,
      height: DEFAULT_PANEL_HEIGHT,
    });
  });

  it("moves the panel up so a default-height window stays on-screen", () => {
    expect(defaultPanelFrameOnDisplay({ x: 120, y: 700 }, display)).toEqual({
      x: 120,
      y: 420,
      width: DEFAULT_PANEL_WIDTH,
      height: DEFAULT_PANEL_HEIGHT,
    });
  });

  it("moves the panel left so a default-width window stays on-screen", () => {
    expect(defaultPanelFrameOnDisplay({ x: 1300, y: 80 }, display)).toEqual({
      x: 620,
      y: 80,
      width: DEFAULT_PANEL_WIDTH,
      height: DEFAULT_PANEL_HEIGHT,
    });
  });
});

describe("fitPanelToContent", () => {
  it("does not grow past the display bottom", async () => {
    windowState.position = { x: 100, y: 700 };
    const content = { scrollHeight: 2000 } as HTMLElement;
    await fitPanelToContent(content, { offsetHeight: 52 } as HTMLElement);
    expect(setSize).toHaveBeenCalledWith({ width: 820, height: 200 });
  });

  it("uses the content height when it already fits", async () => {
    const content = { scrollHeight: 300 } as HTMLElement;
    await fitPanelToContent(content, { offsetHeight: 52 } as HTMLElement);
    expect(setSize).toHaveBeenCalledWith({ width: 820, height: 352 });
  });
});

describe("restoreDefaultPanelSize", () => {
  it("restores 820×480 at the current origin when it fits", async () => {
    await restoreDefaultPanelSize();
    expect(setPosition).not.toHaveBeenCalled();
    expect(setSize).toHaveBeenCalledWith({
      width: DEFAULT_PANEL_WIDTH,
      height: DEFAULT_PANEL_HEIGHT,
    });
  });

  it("moves the panel up before restoring size when the bottom would overflow", async () => {
    windowState.position = { x: 100, y: 700 };
    await restoreDefaultPanelSize();
    expect(setPosition).toHaveBeenCalledWith({ x: 100, y: 420 });
    expect(setSize).toHaveBeenCalledWith({
      width: DEFAULT_PANEL_WIDTH,
      height: DEFAULT_PANEL_HEIGHT,
    });
  });
});
