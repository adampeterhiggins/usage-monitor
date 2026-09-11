import { invoke } from "@tauri-apps/api/core";
import { LogicalSize } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { toast } from "./toast";

export const APPEARANCE_WINDOW_LABEL = "appearance";
export { APPEARANCE_CHANGED_EVENT } from "../contracts/platform";

const APPEARANCE_WINDOW_WIDTH = 760;
const APPEARANCE_WINDOW_HEIGHT = 820;

const APPEARANCE_WINDOW_OPTIONS = {
  url: "index.html",
  title: "Appearance",
  width: APPEARANCE_WINDOW_WIDTH,
  height: APPEARANCE_WINDOW_HEIGHT,
  minWidth: 700,
  minHeight: 680,
  resizable: true,
  decorations: true,
  transparent: false,
  center: true,
  focus: true,
  alwaysOnTop: true,
  skipTaskbar: false,
} as const;

/** The Appearance window's unmount signals the native side it closed. */
export async function notifyAppearanceClosed(): Promise<void> {
  await invoke("appearance_window_closed");
}

function watchAppearanceLifecycle(window: WebviewWindow): void {
  void window.once("tauri://destroyed", () => {
    void notifyAppearanceClosed();
  });
}

/** Open (or focus) the dedicated Appearance settings window. */
export async function openAppearanceWindow(): Promise<void> {
  try {
    // Keep the accessory app active and skip blur-hide for the tray panel so
    // NSApp.hide does not immediately vanish this window.
    await invoke("prepare_open_appearance");
  } catch {
    // Older builds without the command still attempt to open the window.
  }

  const existing = await WebviewWindow.getByLabel(APPEARANCE_WINDOW_LABEL);
  if (existing) {
    try {
      watchAppearanceLifecycle(existing);
      await existing.setSize(
        new LogicalSize(APPEARANCE_WINDOW_WIDTH, APPEARANCE_WINDOW_HEIGHT),
      );
      await existing.show();
      await existing.setFocus();
    } catch (error) {
      toast.error("Couldn’t open Appearance", {
        description: error instanceof Error ? error.message : String(error),
      });
      void notifyAppearanceClosed();
    }
    return;
  }

  const window = new WebviewWindow(APPEARANCE_WINDOW_LABEL, { ...APPEARANCE_WINDOW_OPTIONS });
  watchAppearanceLifecycle(window);
  window.once("tauri://error", (event) => {
    void notifyAppearanceClosed();
    toast.error("Couldn’t open Appearance", {
      description: typeof event.payload === "string" ? event.payload : String(event.payload),
    });
  });
}
