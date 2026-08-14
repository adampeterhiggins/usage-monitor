import { fetch } from "@tauri-apps/plugin-http";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export class HttpError extends Error {
  status: number;
  retryAfterSeconds?: number;

  constructor(message: string, status: number, retryAfterSeconds?: number) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function fetchJson<T>(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<T> {
  const res = await fetch(url, {
    method: init.method,
    body: init.body,
    headers: {
      "User-Agent": BROWSER_UA,
      Accept: "application/json",
      ...init.headers,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    const snippet = text.replace(/\s+/g, " ").slice(0, 300);
    const retryAfter = res.headers.get("retry-after");
    throw new HttpError(
      `HTTP ${res.status} from ${new URL(url).pathname}: ${snippet}`,
      res.status,
      retryAfter ? parseInt(retryAfter, 10) || undefined : undefined,
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Non-JSON response from ${new URL(url).pathname}: ${text.slice(0, 200)}`);
  }
}
