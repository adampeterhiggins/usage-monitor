import { MOCK_STORES } from "../fixtures";
import { STORE_PREFIX } from "./runtime";

/**
 * plugin-store LazyStore stand-in: seeded from fixtures, then persisted to
 * localStorage so theme/settings edits survive reloads while iterating.
 * `__TAURI_MOCK__.reset()` restores the seeds.
 */
export class LazyStore {
  private path: string;
  private data: Record<string, unknown>;

  constructor(path: string) {
    this.path = path;
    const persisted =
      typeof localStorage !== "undefined" ? localStorage.getItem(STORE_PREFIX + path) : null;
    this.data = persisted
      ? (JSON.parse(persisted) as Record<string, unknown>)
      : { ...(MOCK_STORES[path] ?? {}) };
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.data[key] as T | undefined;
  }

  async set(key: string, value: unknown): Promise<void> {
    this.data[key] = value;
  }

  async save(): Promise<void> {
    // Flush on save, matching the real plugin's durability boundary.
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORE_PREFIX + this.path, JSON.stringify(this.data));
  }
}
