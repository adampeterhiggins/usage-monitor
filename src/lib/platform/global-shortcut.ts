import { isRegistered, register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_TOGGLE_SHORTCUT, toGlobalShortcut } from "./shortcut";

let current: string | null = null;

async function togglePanel() {
  await invoke("toggle_window");
}

export async function registerToggleShortcut(accelerator: string): Promise<boolean> {
  const next = toGlobalShortcut(accelerator);
  if (current === next) return true;

  if (current) {
    try {
      await unregister(current);
    } catch {
      // already gone
    }
    current = null;
  }

  try {
    if (await isRegistered(next)) return false;
    await register(next, (event) => {
      if (event.state === "Pressed") void togglePanel();
    });
    current = next;
    return true;
  } catch {
    if (current) {
      try {
        await register(current, (event) => {
          if (event.state === "Pressed") void togglePanel();
        });
      } catch {
        current = null;
      }
    }
    return false;
  }
}

export async function initToggleShortcut(saved: string): Promise<string> {
  if (await registerToggleShortcut(saved)) return saved;
  if (saved !== DEFAULT_TOGGLE_SHORTCUT && (await registerToggleShortcut(DEFAULT_TOGGLE_SHORTCUT))) {
    return DEFAULT_TOGGLE_SHORTCUT;
  }
  return saved;
}
