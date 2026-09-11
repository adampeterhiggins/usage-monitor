/**
 * Shared state for the browser mock. Importing any `tauri-mock/*` module
 * installs `window.__TAURI_MOCK__`, which test drivers use to emit events
 * (e.g. `window:shown`), inspect invoke calls, and reset store contents.
 */

export interface InvokeRecord {
  cmd: string;
  args: unknown;
}

type EventHandler = (event: { event: string; payload: unknown }) => void;

const eventListeners = new Map<string, Set<EventHandler>>();
export const invokeLog: InvokeRecord[] = [];

export function logInvoke(cmd: string, args: unknown): void {
  invokeLog.push({ cmd, args });
}

export function onEvent(event: string, handler: EventHandler): () => void {
  let set = eventListeners.get(event);
  if (!set) eventListeners.set(event, (set = new Set()));
  set.add(handler);
  return () => set.delete(handler);
}

export function emitEvent(event: string, payload?: unknown): void {
  for (const handler of eventListeners.get(event) ?? []) {
    handler({ event, payload });
  }
}

const STORE_PREFIX = "mock-tauri:store:";

export function resetMockState(): void {
  invokeLog.length = 0;
  if (typeof localStorage === "undefined") return;
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(STORE_PREFIX)) localStorage.removeItem(key);
  }
}

export { STORE_PREFIX };

declare global {
  interface Window {
    __TAURI_MOCK__?: {
      emit: (event: string, payload?: unknown) => void;
      invokeLog: InvokeRecord[];
      reset: () => void;
    };
  }
}

if (typeof window !== "undefined") {
  window.__TAURI_MOCK__ = {
    emit: emitEvent,
    invokeLog,
    reset: resetMockState,
  };
  // A marker any driver can assert on to confirm the bundle is mocked.
  document.documentElement.dataset.mockTauri = "true";
}
