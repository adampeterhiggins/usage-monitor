import { openExternal } from "../platform/external";
import { fetchJson, fetchText } from "../platform/http";
import type { ProviderLoginResult } from "../contracts/auth";
import {
  abortError,
  decodeJwtPayload,
  isAbortError,
  oauthErrorMessage,
  pkceChallenge,
  randomBase64Url,
  sleep,
  type ProviderLoginSession,
} from "./login-session";

const LOGIN_URL = "https://cursor.com/loginDeepControl";
const POLL_URL = "https://api2.cursor.sh/auth/poll";
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

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

function accessTokenFromPoll(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const record = data as { accessToken?: unknown; access_token?: unknown };
  const token = record.accessToken ?? record.access_token;
  return typeof token === "string" && token.trim() ? token.trim() : undefined;
}

async function pollCursorAuth(uuid: string, verifier: string, signal: AbortSignal): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let delay = 1000;
  while (!signal.aborted) {
    if (Date.now() > deadline) throw new Error("Cursor sign-in timed out. Try again.");
    const url = `${POLL_URL}?uuid=${encodeURIComponent(uuid)}&verifier=${encodeURIComponent(verifier)}`;
    try {
      const res = await fetchText(url, {
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        signal,
      });
      if (res.status === 404) {
        await sleep(delay, signal);
        delay = Math.min(Math.round(delay * 1.2), 10_000);
        continue;
      }
      let data: unknown;
      try {
        data = JSON.parse(res.body) as unknown;
      } catch {
        throw new Error(`Cursor sign-in failed: ${res.body.replace(/\s+/g, " ").slice(0, 200)}`);
      }
      if (res.status >= 400) {
        throw new Error(oauthErrorMessage(data, `Cursor sign-in failed (HTTP ${res.status}).`));
      }
      const accessToken = accessTokenFromPoll(data);
      if (accessToken) return accessToken;
      throw new Error("Cursor did not return an access token.");
    } catch (error) {
      if (isAbortError(error)) throw error;
      if (error instanceof Error && /Cursor sign-in|did not return/.test(error.message)) throw error;
      await sleep(delay, signal);
      delay = Math.min(Math.round(delay * 1.2), 10_000);
    }
  }
  throw abortError(signal);
}

export async function startCursorLogin(): Promise<ProviderLoginSession> {
  const controller = new AbortController();
  const verifier = randomBase64Url(32);
  const challenge = pkceChallenge(verifier);
  const uuid = crypto.randomUUID();
  const loginUrl = new URL(LOGIN_URL);
  loginUrl.searchParams.set("challenge", challenge);
  loginUrl.searchParams.set("uuid", uuid);
  loginUrl.searchParams.set("mode", "login");
  loginUrl.searchParams.set("redirectTarget", "cli");

  void openExternal(loginUrl.toString()).catch(() => {
    // The account dialog still shows a way to reopen the browser.
  });

  const done = (async (): Promise<ProviderLoginResult> => {
    const accessToken = await pollCursorAuth(uuid, verifier, controller.signal);
    const credential = sessionTokenFromAccessToken(accessToken);
    return {
      credential,
      suggestedLabel: await fetchSuggestedLabel(credential, new AbortController().signal),
    };
  })();

  return {
    kind: "browser",
    prompt: "Finish signing in in your browser. Passkeys work there.",
    verificationUri: loginUrl.toString(),
    done,
    cancel: () => controller.abort(),
  };
}
