import {
  MOCK_CURSOR_SESSION_JWT,
  MOCK_HOME_FILES,
  MOCK_HTTP_ROUTES,
  MOCK_KEYCHAIN_ACCOUNTS,
  MOCK_KEYCHAIN_PASSWORDS,
} from "./fixtures";

interface NativeHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

function routeHttp(args: Record<string, unknown>): NativeHttpResponse {
  const url = typeof args.url === "string" ? args.url : "";
  for (const [prefix, route] of MOCK_HTTP_ROUTES) {
    if (url.includes(prefix)) {
      return {
        status: route.status,
        headers: { "content-type": "application/json" },
        body: typeof route.body === "string" ? route.body : JSON.stringify(route.body),
      };
    }
  }
  // Fail loudly rather than returning 200s for endpoints nobody stubbed.
  return {
    status: 501,
    headers: {},
    body: JSON.stringify({ error: `[mock-tauri] unstubbed URL: ${url}` }),
  };
}

/**
 * Every invoke command the frontend issues, in one place. Unstubbed commands
 * throw — a silent pass-through would be a lie about what ran.
 */
export function handleCommand(cmd: string, args: unknown): unknown {
  const a = (args ?? {}) as Record<string, unknown>;
  switch (cmd) {
    case "http_request":
      return routeHttp(a);
    case "list_keychain_accounts":
      return MOCK_KEYCHAIN_ACCOUNTS[String(a.service)] ?? [];
    case "read_keychain_password": {
      const secret = MOCK_KEYCHAIN_PASSWORDS[String(a.service)];
      if (secret === undefined) throw new Error(`[mock-tauri] no secret for ${String(a.service)}`);
      return secret;
    }
    case "read_cursor_ide_access_token":
      return MOCK_CURSOR_SESSION_JWT;
    case "cursor_ide_login_meta":
      return { email: "dev@example.com", membership: "pro" };
    case "read_home_file": {
      const body = MOCK_HOME_FILES[String(a.relPath)];
      if (body === undefined) {
        // The real command rejects for missing files; callers catch and move on.
        throw new Error(`[mock-tauri] no file at ~/${String(a.relPath)}`);
      }
      return body;
    }
    case "set_account_modal_open":
    case "hide_window":
    case "toggle_window":
    case "prepare_open_appearance":
    case "appearance_window_closed":
      return null;
    default:
      throw new Error(`[mock-tauri] unstubbed command: ${cmd}`);
  }
}
