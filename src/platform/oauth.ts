/** Loopback listener for provider sign-in redirects.
 *
 *  Bind first so the real port can go into `redirect_uri`, open the browser,
 *  then await the one callback. Read-only from the app's side: the listener
 *  hands back the query string and nothing else. */

import { invoke } from "@tauri-apps/api/core";

export interface LoopbackCallback {
  port: number;
  redirectUri: string;
  /** Resolves with the callback's query parameters. */
  wait: (signal?: AbortSignal) => Promise<URLSearchParams>;
  release: () => void;
}

export interface LoopbackBindOptions {
  /** Ports to try in order — for providers whose redirect URIs are
   *  allow-listed (Codex: 1455/1457). Default: any free port. */
  ports?: number[];
  /** Path the listener waits on (Codex: `/auth/callback`). Default `/callback`. */
  callbackPath?: string;
  /** Host written into `redirect_uri`. `localhost` matches the CLI allow-lists;
   *  `127.0.0.1` is the default. */
  host?: "127.0.0.1" | "localhost";
}

/** Bind a loopback port for one sign-in redirect. */
export async function bindLoopbackCallback(
  timeoutSeconds = 300,
  options: LoopbackBindOptions = {},
): Promise<LoopbackCallback> {
  const port = await invoke<number>("oauth_listen", {
    ports: options.ports ?? null,
    callbackPath: options.callbackPath ?? null,
  });
  const host = options.host ?? "127.0.0.1";
  const callbackPath = options.callbackPath ?? "/callback";
  let released = false;

  const release = () => {
    if (released) return;
    released = true;
    void invoke("oauth_cancel", { port }).catch(() => {
      // Nothing to release — the listener already handed over its request.
    });
  };

  return {
    port,
    redirectUri: `http://${host}:${port}${callbackPath}`,
    release: () => release(),
    wait: async (signal?: AbortSignal) => {
      const onAbort = () => release();
      signal?.addEventListener("abort", onAbort, { once: true });
      try {
        const query = await invoke<string>("oauth_wait", { port, timeoutSecs: timeoutSeconds });
        released = true;
        return new URLSearchParams(query);
      } finally {
        signal?.removeEventListener("abort", onAbort);
      }
    },
  };
}
