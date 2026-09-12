/**
 * Mock `@tauri-apps/api/window`. `?window=appearance` renders the appearance
 * surface instead of the tray panel, so both windows are testable headlessly.
 */
export class LogicalSize {
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
}

export class LogicalPosition {
  x: number;
  y: number;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
}

function currentLabel(): string {
  if (typeof window === "undefined") return "main";
  return new URLSearchParams(window.location.search).get("window") ?? "main";
}

const MOCK_MONITOR = {
  name: "mock",
  scaleFactor: 1,
  position: { x: 0, y: 0 },
  size: { width: 1440, height: 900 },
};

export async function currentMonitor() {
  return MOCK_MONITOR;
}

export function getCurrentWindow() {
  return {
    label: currentLabel(),
    startDragging: async () => {},
    setSize: async () => {},
    setPosition: async () => {},
    show: async () => {},
    setFocus: async () => {},
    isFocused: async () => true,
    scaleFactor: async () => 1,
    innerSize: async () => ({ width: 820, height: 480 }),
    outerSize: async () => ({ width: 820, height: 480 }),
    outerPosition: async () => ({ x: 120, y: 80 }),
  };
}
