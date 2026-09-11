/** Application-facing native capability contracts.
 *
 *  Everything outside `lib/platform/` talks to these shapes; the adapters in
 *  `lib/platform/` map them onto Tauri commands/plugins (and the mock layer
 *  supplies the same surface through `__TAURI_INTERNALS__`). No runtime Tauri
 *  values appear here — the plugin's `Update` object stays inside the
 *  adapter behind `PendingUpdate`. */

/** Typed event names crossing the frontend/native boundary. */
export const WINDOW_SHOWN_EVENT = "window:shown";
export const OPEN_SETTINGS_EVENT = "settings:openPopover";
export const APPEARANCE_CHANGED_EVENT = "appearance:changed";

/** A named document store (backed by a `*.json` plugin-store file). */
export interface DocumentStore {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  save(): Promise<void>;
}

/** Normalized progress while a pending update downloads. */
export type UpdateProgressEvent =
  | { type: "started"; contentLength?: number | null }
  | { type: "progress"; chunkLength: number }
  | { type: "finished" };

/** An update the platform has found and can install — opaque to the app. */
export interface PendingUpdate {
  currentVersion: string;
  version: string;
  notes: string | null;
  publishedAt: string | null;
  downloadAndInstall(
    onProgress: (event: UpdateProgressEvent) => void,
    headers?: Record<string, string>,
  ): Promise<void>;
}
