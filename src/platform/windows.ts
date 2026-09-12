/** Panel window capabilities — lifecycle, drag, resize, and the modal-open
 *  bridge that keeps tray hide-on-blur off while a dialog is up. The
 *  Appearance window's lifecycle lives in `appearance-window.ts`. */

import { invoke } from "@tauri-apps/api/core";
import { currentMonitor, getCurrentWindow, LogicalPosition, LogicalSize } from "@tauri-apps/api/window";

import { WINDOW_SHOWN_EVENT } from "../contracts/platform";
import { subscribe } from "./events";

export function currentWindowLabel(): string {
  return getCurrentWindow().label;
}

export function startPanelDragging(): void {
  void getCurrentWindow().startDragging();
}

export async function hidePanel(): Promise<void> {
  await invoke("hide_window");
}

export async function togglePanel(): Promise<void> {
  await invoke("toggle_window");
}

/** Tell the native side an account modal is up so blur-hide stays off. */
export async function setAccountModalOpen(open: boolean): Promise<void> {
  await invoke("set_account_modal_open", { open });
}

/** The native side shows the panel (tray click, global shortcut). */
export function onPanelShown(handler: () => void): () => void {
  return subscribe(WINDOW_SHOWN_EVENT, handler);
}

/** Matches the main window size in `src-tauri/tauri.conf.json`. */
export const DEFAULT_PANEL_WIDTH = 820;
export const DEFAULT_PANEL_HEIGHT = 480;

const MIN_WIDTH = 560;
const MIN_HEIGHT = 280;

export type DisplayRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

/** Keep the panel's bottom edge on the display that contains its top-left. */
export function clampPanelHeightToDisplay(
  height: number,
  top: number,
  displayBottom: number,
  chromeHeight = 0,
): number {
  const desired = Math.max(MIN_HEIGHT, height);
  const maxHeight = Math.floor(displayBottom - top - chromeHeight);
  if (!Number.isFinite(maxHeight)) return desired;
  // Stay on-screen even when the remaining strip is shorter than min height.
  if (maxHeight < MIN_HEIGHT) return Math.max(0, maxHeight);
  return Math.min(desired, maxHeight);
}

/** Place the default 820×480 frame so its bottom-right stays on `display`. */
export function defaultPanelFrameOnDisplay(
  origin: { x: number; y: number },
  display: DisplayRect | null,
): { x: number; y: number; width: number; height: number } {
  let x = origin.x;
  let y = origin.y;
  let width = DEFAULT_PANEL_WIDTH;
  let height = DEFAULT_PANEL_HEIGHT;
  if (!display) return { x, y, width, height };

  if (y + height > display.bottom) {
    y = display.bottom - height;
  }
  if (y < display.top) {
    y = display.top;
    height = Math.max(MIN_HEIGHT, Math.min(height, Math.floor(display.bottom - y)));
  }
  if (x + width > display.right) {
    x = display.right - width;
  }
  if (x < display.left) {
    x = display.left;
    width = Math.max(MIN_WIDTH, Math.min(width, Math.floor(display.right - x)));
  }
  return { x, y, width, height };
}

type PanelPlacement = {
  innerWidth: number;
  chromeHeight: number;
  originX: number;
  originY: number;
  display: DisplayRect | null;
};

async function readPanelPlacement(): Promise<PanelPlacement> {
  const win = getCurrentWindow();
  const [factor, inner, outer, pos, monitor] = await Promise.all([
    win.scaleFactor(),
    win.innerSize(),
    win.outerSize(),
    win.outerPosition(),
    currentMonitor(),
  ]);
  return {
    innerWidth: inner.width / factor,
    chromeHeight: (outer.height - inner.height) / factor,
    originX: pos.x / factor,
    originY: pos.y / factor,
    display: monitor
      ? {
          left: monitor.position.x / factor,
          top: monitor.position.y / factor,
          right: (monitor.position.x + monitor.size.width) / factor,
          bottom: (monitor.position.y + monitor.size.height) / factor,
        }
      : null,
  };
}

/** Resize the panel so `content` (plus an optional header) fits. */
export async function fitPanelToContent(
  content: HTMLElement,
  header: HTMLElement | null,
): Promise<void> {
  const win = getCurrentWindow();
  const placement = await readPanelPlacement();
  const width = Math.max(MIN_WIDTH, Math.round(placement.innerWidth));
  const desiredHeight = Math.max(
    MIN_HEIGHT,
    Math.round((header?.offsetHeight ?? 0) + content.scrollHeight),
  );
  const height = placement.display
    ? clampPanelHeightToDisplay(
        desiredHeight,
        placement.originY,
        placement.display.bottom,
        placement.chromeHeight,
      )
    : desiredHeight;
  await win.setSize(new LogicalSize(width, height));
}

/** Restore the launch size from `tauri.conf.json`, keeping the panel on-screen. */
export async function restoreDefaultPanelSize(): Promise<void> {
  const win = getCurrentWindow();
  const placement = await readPanelPlacement();
  const frame = defaultPanelFrameOnDisplay(
    { x: placement.originX, y: placement.originY },
    placement.display,
  );
  if (frame.x !== placement.originX || frame.y !== placement.originY) {
    await win.setPosition(new LogicalPosition(frame.x, frame.y));
  }
  await win.setSize(new LogicalSize(frame.width, frame.height));
}
