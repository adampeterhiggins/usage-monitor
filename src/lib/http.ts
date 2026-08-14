import { invoke } from "@tauri-apps/api/core";

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

interface NativeHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export async function fetchJson<T>(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<T> {
  const res = await invoke<NativeHttpResponse>("http_request", {
    url,
    method: init.method ?? "GET",
    headers: {
      "User-Agent": BROWSER_UA,
      Accept: "application/json",
      ...init.headers,
    },
    body: init.body ?? null,
  });
  if (res.status < 200 || res.status >= 300) {
    const snippet = res.body.replace(/\s+/g, " ").slice(0, 300);
    const retryAfter = header(res.headers, "retry-after");
    throw new HttpError(
      `HTTP ${res.status} from ${new URL(url).pathname}: ${snippet}`,
      res.status,
      retryAfter ? parseInt(retryAfter, 10) || undefined : undefined,
    );
  }
  try {
    return JSON.parse(res.body) as T;
  } catch {
    throw new Error(`Non-JSON response from ${new URL(url).pathname}: ${res.body.slice(0, 200)}`);
  }
}

function header(headers: Record<string, string>, name: string): string | undefined {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return value;
  }
  return undefined;
}
