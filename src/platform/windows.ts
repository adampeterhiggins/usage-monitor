/** Panel window capabilities — lifecycle, drag, resize, and the modal-open
 *  bridge that keeps tray hide-on-blur off while a dialog is up. The
 *  Appearance window's lifecycle lives in `appearance-window.ts`. */

import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";

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

const MIN_WIDTH = 560;
const MIN_HEIGHT = 280;

/** Resize the panel so `content` (plus an optional header) fits. */
export async function fitPanelToContent(
  content: HTMLElement,
  header: HTMLElement | null,
): Promise<void> {
  const win = getCurrentWindow();
  const factor = await win.scaleFactor();
  const inner = await win.innerSize();
  const width = Math.max(MIN_WIDTH, Math.round(inner.width / factor));
  const height = Math.max(
    MIN_HEIGHT,
    Math.round((header?.offsetHeight ?? 0) + content.scrollHeight),
  );
  await win.setSize(new LogicalSize(width, height));
}
