/** Status-item menu bridge — publish the usage summary the native menu draws,
 *  and hear back when it opens or asks for a refresh. */

import { invoke } from "@tauri-apps/api/core";

import { TRAY_MENU_OPENED_EVENT, TRAY_REFRESH_EVENT } from "../contracts/platform";
import type { TrayMenuSnapshot } from "../contracts/trayMenu";
import { subscribe } from "./events";

export async function setTrayMenu(snapshot: TrayMenuSnapshot): Promise<void> {
  await invoke("set_tray_menu", { snapshot });
}

/** The user opened the status-item menu. */
export function onTrayMenuOpened(handler: () => void): () => void {
  return subscribe(TRAY_MENU_OPENED_EVENT, handler);
}

/** The user chose Refresh in the status-item menu. */
export function onTrayRefreshRequested(handler: () => void): () => void {
  return subscribe(TRAY_REFRESH_EVENT, handler);
}
