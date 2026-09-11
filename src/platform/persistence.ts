/** Named JSON document stores, backed by the plugin-store `LazyStore`.
 *  Keeps the plugin import inside the platform layer; accounts and settings
 *  both use `openDocumentStore` rather than constructing stores directly. */

import { LazyStore } from "@tauri-apps/plugin-store";

import type { DocumentStore } from "../contracts/platform";

export function openDocumentStore(name: string): DocumentStore {
  const store = new LazyStore(name);
  return {
    get: <T>(key: string) => store.get<T>(key),
    set: (key, value) => store.set(key, value),
    delete: async (key) => {
      await store.delete(key);
    },
    save: () => store.save(),
  };
}
