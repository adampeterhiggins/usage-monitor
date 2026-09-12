/** External actions — opening URLs in the user's browser. */

import { openUrl } from "@tauri-apps/plugin-opener";

export async function openExternal(url: string): Promise<void> {
  await openUrl(url);
}
