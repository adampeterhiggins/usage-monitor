import { emitEvent, onEvent } from "./runtime";

export async function listen(
  event: string,
  handler: (event: { event: string; payload: unknown }) => void,
): Promise<() => void> {
  return onEvent(event, handler);
}

export async function emit(event: string, payload?: unknown): Promise<void> {
  emitEvent(event, payload);
}

export async function once(
  event: string,
  handler: (event: { event: string; payload: unknown }) => void,
): Promise<() => void> {
  const unlisten = onEvent(event, (e) => {
    unlisten();
    handler(e);
  });
  return unlisten;
}
