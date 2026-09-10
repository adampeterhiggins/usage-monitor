import { onEvent } from "./runtime";

/** Browser-mode stand-in: there is only ever one real document. */
export class WebviewWindow {
  label: string;
  options: unknown;

  constructor(label: string, options?: unknown) {
    this.label = label;
    this.options = options;
  }

  static async getByLabel(_label: string): Promise<WebviewWindow | null> {
    return null;
  }

  async once(event: string, handler: (e: { event: string; payload: unknown }) => void) {
    const unlisten = onEvent(event, (e) => {
      unlisten();
      handler(e);
    });
    return unlisten;
  }

  async setSize(_size: unknown): Promise<void> {}
  async show(): Promise<void> {}
  async setFocus(): Promise<void> {}
}
