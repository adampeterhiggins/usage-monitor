import { invoke } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { fetchJson } from "./http";
import { abortError, decodeJwtPayload, sleep, type ProviderLoginResult, type ProviderLoginSession } from "./login-session";

const LOGIN_WINDOW_LABEL = "login-cursor";
const LOGIN_URL = "https://cursor.com/login";
const COOKIE_NAME = "WorkosCursorSessionToken";

export function decodeCursorUserId(token: string): string | undefined {
  const payload = decodeJwtPayload(token);
  const sub = payload?.sub;
  if (typeof sub !== "string" || !sub) return undefined;
  return sub.includes("|") ? sub.slice(sub.lastIndexOf("|") + 1) : sub;
}

export function sessionTokenFromAccessToken(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Cursor credential is empty.");
  if (trimmed.includes("%3A%3A")) return trimmed.replace(/%3A%3A/gi, "::");
  if (trimmed.includes("::")) return trimmed;

  if (trimmed.startsWith("{")) {
    let json: { accessToken?: string; access_token?: string };
    try {
      json = JSON.parse(trimmed) as { accessToken?: string; access_token?: string };
    } catch {
      throw new Error("Pasted Cursor credential is not valid JSON.");
    }
    const jwt = json.accessToken ?? json.access_token;
    if (!jwt) throw new Error("Pasted Cursor JSON has no access token.");
    return sessionTokenFromAccessToken(jwt);
  }

  const userId = decodeCursorUserId(trimmed);
  if (!userId) throw new Error("Could not derive a Cursor user id from this token.");
  return `${userId}::${trimmed}`;
}

async function fetchSuggestedLabel(sessionToken: string, signal: AbortSignal): Promise<string | undefined> {
  try {
    const me = await fetchJson<{ email?: string; name?: string }>("https://cursor.com/api/auth/me", {
      headers: {
        Cookie: `WorkosCursorSessionToken=${sessionToken}`,
        Origin: "https://cursor.com",
        Referer: "https://cursor.com/dashboard",
      },
      signal,
    });
    return me.email?.trim() || me.name?.trim() || undefined;
  } catch {
    return undefined;
  }
}

async function waitForCookie(signal: AbortSignal): Promise<string> {
  while (!signal.aborted) {
    try {
      const value = await invoke<string | null>("read_window_cookie", {
        label: LOGIN_WINDOW_LABEL,
        name: COOKIE_NAME,
        urls: ["https://cursor.com/", "https://www.cursor.com/", "https://authenticator.cursor.sh/"],
      });
      if (value?.trim()) return sessionTokenFromAccessToken(value);
    } catch {
      // Window may not be ready yet.
    }
    await sleep(800, signal);
  }
  throw abortError(signal);
}

export async function startCursorLogin(): Promise<ProviderLoginSession> {
  const controller = new AbortController();
  try {
    await invoke("prepare_open_appearance");
  } catch {
    // Older builds without the command still attempt to open the window.
  }

  const existing = await WebviewWindow.getByLabel(LOGIN_WINDOW_LABEL);
  if (existing) {
    try {
      await existing.close();
    } catch {
      // Replace a leftover window from a previous attempt.
    }
  }

  const window = new WebviewWindow(LOGIN_WINDOW_LABEL, {
    url: LOGIN_URL,
    title: "Sign in to Cursor",
    width: 520,
    height: 740,
    minWidth: 420,
    minHeight: 560,
    decorations: true,
    transparent: false,
    center: true,
    focus: true,
    alwaysOnTop: true,
    skipTaskbar: false,
  });

  const closeWindow = () => {
    void window.close().catch(() => undefined);
    void invoke("appearance_window_closed").catch(() => undefined);
  };

  void window.once("tauri://destroyed", () => {
    void invoke("appearance_window_closed").catch(() => undefined);
    if (!controller.signal.aborted) controller.abort();
  });
  void window.once("tauri://error", () => {
    closeWindow();
    if (!controller.signal.aborted) controller.abort();
  });

  const done = (async (): Promise<ProviderLoginResult> => {
    try {
      const credential = await waitForCookie(controller.signal);
      controller.abort();
      closeWindow();
      return {
        credential,
        suggestedLabel: await fetchSuggestedLabel(credential, new AbortController().signal),
      };
    } catch (error) {
      closeWindow();
      throw error;
    }
  })();

  return {
    kind: "browser",
    prompt: "Finish signing in in the Cursor window that opened.",
    done,
    cancel: () => {
      controller.abort();
      closeWindow();
    },
  };
}
