/** Typed native event subscriptions.
 *
 *  `subscribe` guarantees safe cleanup: if the effect is disposed before the
 *  registration promise resolves, the returned unlisten is invoked
 *  immediately; cleanup is idempotent and handlers never fire after disposal
 *  (the wrapper checks a disposed flag before calling through). */

import { emit, listen } from "@tauri-apps/api/event";

export function subscribe(event: string, handler: () => void): () => void {
  let disposed = false;
  let unlisten: (() => void) | undefined;

  const guarded = () => {
    if (!disposed) handler();
  };

  void listen(event, guarded)
    .then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    })
    .catch(() => {
      // Registration failure leaves the subscription silently absent —
      // callers treat events as advisory.
    });

  return () => {
    if (disposed) return;
    disposed = true;
    unlisten?.();
    unlisten = undefined;
  };
}

export async function emitEvent(event: string, payload?: unknown): Promise<void> {
  await emit(event, payload ?? null);
}
