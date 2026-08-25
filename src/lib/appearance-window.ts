import { invoke } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { toast } from "./toast";

export const APPEARANCE_WINDOW_LABEL = "appearance";
export const APPEARANCE_CHANGED_EVENT = "appearance:changed";

const APPEARANCE_WINDOW_OPTIONS = {
  url: "index.html",
  title: "Appearance",
  width: 760,
  height: 640,
  minWidth: 700,
  minHeight: 520,
  resizable: true,
  decorations: true,
  transparent: false,
  center: true,
  focus: true,
  alwaysOnTop: true,
  skipTaskbar: false,
} as const;

function watchAppearanceLifecycle(window: WebviewWindow): void {
  void window.once("tauri://destroyed", () => {
    void invoke("appearance_window_closed");
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
      await existing.show();
      await existing.setFocus();
    } catch (error) {
      toast.error("Couldn’t open Appearance", {
        description: error instanceof Error ? error.message : String(error),
      });
      void invoke("appearance_window_closed");
    }
    return;
  }

  const window = new WebviewWindow(APPEARANCE_WINDOW_LABEL, { ...APPEARANCE_WINDOW_OPTIONS });
  watchAppearanceLifecycle(window);
  window.once("tauri://error", (event) => {
    void invoke("appearance_window_closed");
    toast.error("Couldn’t open Appearance", {
      description: typeof event.payload === "string" ? event.payload : String(event.payload),
    });
  });
}
