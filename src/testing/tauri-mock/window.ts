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

function currentLabel(): string {
  if (typeof window === "undefined") return "main";
  return new URLSearchParams(window.location.search).get("window") ?? "main";
}

export function getCurrentWindow() {
  return {
    label: currentLabel(),
    startDragging: async () => {},
    setSize: async () => {},
    show: async () => {},
    setFocus: async () => {},
    isFocused: async () => true,
  };
}
