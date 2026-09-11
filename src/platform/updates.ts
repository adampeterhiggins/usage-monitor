/** The native updater behind `PendingUpdate`. The plugin's `Update` object
 *  never escapes this module — the store holds the opaque contract type and
 *  drives downloads through `downloadAndInstall`. */

import { check } from "@tauri-apps/plugin-updater";

import type { PendingUpdate } from "../contracts/platform";

export async function checkNativeUpdate(
  headers?: Record<string, string>,
): Promise<PendingUpdate | null> {
  const update = await check({ headers, timeout: 30_000 });
  if (!update) return null;

  return {
    currentVersion: update.currentVersion,
    version: update.version,
    notes: update.body ?? null,
    publishedAt: update.date ?? null,
    downloadAndInstall: (onProgress, downloadHeaders) =>
      update.downloadAndInstall(
        (event) => {
          switch (event.event) {
            case "Started":
              onProgress({ type: "started", contentLength: event.data.contentLength });
              break;
            case "Progress":
              onProgress({ type: "progress", chunkLength: event.data.chunkLength });
              break;
            case "Finished":
              onProgress({ type: "finished" });
              break;
          }
        },
        { headers: downloadHeaders },
      ),
  };
}
