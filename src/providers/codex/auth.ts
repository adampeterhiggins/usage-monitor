import { openExternal } from "../../platform/external";
import { bindLoopbackCallback } from "../../platform/oauth";
import { fetchText } from "../../platform/http";
import type { ProviderLoginResult } from "../../contracts/auth";
import {
  decodeJwtPayload,
  oauthErrorMessage,
  pkceChallenge,
  randomBase64Url,
  rejectOnAbort,
  sleep,
  type ProviderLoginSession,
} from "../shared/loginSession";

/** Public Codex CLI OAuth client. Device flow does not use a secret. */
export const CODEX_OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTH_BASE = "https://auth.openai.com";
const DEVICE_USER_CODE_URL = `${AUTH_BASE}/api/accounts/deviceauth/usercode`;
const DEVICE_TOKEN_URL = `${AUTH_BASE}/api/accounts/deviceauth/token`;
const DEVICE_VERIFICATION_URI = `${AUTH_BASE}/codex/device`;
const DEVICE_REDIRECT_URI = `${AUTH_BASE}/deviceauth/callback`;
const TOKEN_URL = `${AUTH_BASE}/oauth/token`;
const DEVICE_TIMEOUT_MS = 15 * 60 * 1000;
const JWT_AUTH_CLAIM = "https://api.openai.com/auth";

/** `codex login` loopback: only these ports are on the client's allow-list. */
const LOOPBACK_CALLBACK_PATH = "/auth/callback";
const LOOPBACK_PORTS = [1455, 1457];
const LOGIN_TIMEOUT_SECONDS = 300;
const BROWSER_SCOPE =
  "openid profile email offline_access api.connectors.read api.connectors.invoke";

export interface CodexOauthTokens {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  accountId?: string;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

function formBody(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

export function accountIdFromAccessToken(accessToken: string): string | undefined {
  const payload = decodeJwtPayload(accessToken);
  const auth = payload?.[JWT_AUTH_CLAIM];
  if (!auth || typeof auth !== "object") return undefined;
  const id = (auth as { chatgpt_account_id?: unknown }).chatgpt_account_id;
  return typeof id === "string" && id ? id : undefined;
}

export function serializeCodexAuthJson(tokens: CodexOauthTokens): string {
  return JSON.stringify({
    tokens: {
      id_token: tokens.idToken ?? "",
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken ?? "",
      account_id: tokens.accountId ?? accountIdFromAccessToken(tokens.accessToken),
    },
    last_refresh: new Date().toISOString(),
  });
}

export function parseCodexAuthJson(raw: string, describe: string): CodexOauthTokens {
  let json: {
    tokens?: { access_token?: string; refresh_token?: string; id_token?: string; account_id?: string };
  };
  try {
    json = JSON.parse(raw) as typeof json;
  } catch {
    throw new Error(`${describe} is not valid JSON (expected auth.json contents).`);
  }
  const accessToken = json.tokens?.access_token;
  if (!accessToken) throw new Error(`${describe} has no tokens.access_token.`);
  return {
    accessToken,
    refreshToken: json.tokens?.refresh_token,
    idToken: json.tokens?.id_token,
    accountId: json.tokens?.account_id || accountIdFromAccessToken(accessToken),
  };
}

async function postJson<T>(url: string, body: unknown, signal: AbortSignal): Promise<{ status: number; data: T }> {
  const res = await fetchText(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });
  try {
    return { status: res.status, data: JSON.parse(res.body) as T };
  } catch {
    throw new Error(`Codex sign-in failed: ${res.body.replace(/\s+/g, " ").slice(0, 200)}`);
  }
}

async function exchangeCode(
  code: string,
  verifier: string,
  redirectUri: string,
  signal: AbortSignal,
): Promise<CodexOauthTokens> {
  const res = await fetchText(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formBody({
      grant_type: "authorization_code",
      client_id: CODEX_OAUTH_CLIENT_ID,
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
    }),
    signal,
  });
  let data: TokenResponse;
  try {
    data = JSON.parse(res.body) as TokenResponse;
  } catch {
    throw new Error(`Codex token exchange failed: ${res.body.replace(/\s+/g, " ").slice(0, 200)}`);
  }
  if (res.status >= 400 || !data.access_token) {
    throw new Error(oauthErrorMessage(data, `Codex token exchange failed (HTTP ${res.status}).`));
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    idToken: data.id_token,
    accountId: accountIdFromAccessToken(data.access_token),
  };
}

export async function refreshCodexOauth(tokens: CodexOauthTokens, signal?: AbortSignal): Promise<CodexOauthTokens> {
  if (!tokens.refreshToken) {
    throw new Error("Codex session has expired. Sign in again on this account.");
  }
  const res = await fetchText(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formBody({
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
      client_id: CODEX_OAUTH_CLIENT_ID,
    }),
    signal: signal ?? new AbortController().signal,
  });
  let data: TokenResponse;
  try {
    data = JSON.parse(res.body) as TokenResponse;
  } catch {
    throw new Error("Codex token expired. Sign in again on this account.");
  }
  if (res.status >= 400 || !data.access_token) {
    throw new Error("Codex token expired. Sign in again on this account.");
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || tokens.refreshToken,
    idToken: data.id_token || tokens.idToken,
    accountId: accountIdFromAccessToken(data.access_token) ?? tokens.accountId,
  };
}

function suggestedLabel(tokens: CodexOauthTokens): string | undefined {
  const payload = tokens.idToken ? decodeJwtPayload(tokens.idToken) : decodeJwtPayload(tokens.accessToken);
  const email = payload?.email;
  return typeof email === "string" && email ? email : undefined;
}

/** Browser sign-in: a loopback listener catches the OAuth redirect, so the
 *  user never pastes anything — the same flow `codex login` runs. */
export async function startCodexBrowserLogin(): Promise<ProviderLoginSession> {
  const controller = new AbortController();
  const callback = await bindLoopbackCallback(LOGIN_TIMEOUT_SECONDS, {
    ports: LOOPBACK_PORTS,
    callbackPath: LOOPBACK_CALLBACK_PATH,
    host: "localhost",
  });
  const redirectUri = callback.redirectUri;
  const verifier = randomBase64Url(32);
  const state = randomBase64Url(16);
  const url = new URL(`${AUTH_BASE}/oauth/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", CODEX_OAUTH_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", BROWSER_SCOPE);
  url.searchParams.set("code_challenge", pkceChallenge(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("id_token_add_organizations", "true");
  url.searchParams.set("codex_cli_simplified_flow", "true");
  url.searchParams.set("state", state);

  const done = (async (): Promise<ProviderLoginResult> => {
    try {
      const params = await Promise.race([
        callback.wait(controller.signal),
        rejectOnAbort(controller.signal),
      ]);
      const error = params.get("error");
      if (error) {
        throw new Error(
          params.get("error_description")?.trim() || `Codex sign-in failed (${error}).`,
        );
      }
      const code = params.get("code")?.trim();
      if (!code) throw new Error("Codex sign-in did not return a code.");
      if (params.get("state") !== state) {
        throw new Error("That sign-in callback doesn't match this request. Start again.");
      }
      const tokens = await exchangeCode(code, verifier, redirectUri, controller.signal);
      return {
        credential: serializeCodexAuthJson(tokens),
        accountId: tokens.accountId,
        suggestedLabel: suggestedLabel(tokens),
      };
    } finally {
      callback.release();
    }
  })();

  return {
    kind: "browser",
    prompt: "Open the sign-in link in the browser you want to use — this dialog updates automatically.",
    verificationUri: url.toString(),
    done,
    cancel: () => controller.abort(),
  };
}

/** Device-code sign-in for environments whose browser cannot reach the
 *  loopback listener. Some orgs disable it — prefer the browser flow. */
export async function startCodexDeviceCodeLogin(): Promise<ProviderLoginSession> {
  const controller = new AbortController();
  const started = await postJson<{
    device_auth_id?: string;
    user_code?: string;
    usercode?: string;
    interval?: number | string;
  }>(DEVICE_USER_CODE_URL, { client_id: CODEX_OAUTH_CLIENT_ID }, controller.signal);

  if (started.status === 404) {
    throw new Error("Codex device-code login is disabled for this account. Enable it in ChatGPT security settings, or paste auth.json.");
  }
  if (started.status >= 400) {
    throw new Error(`Codex sign-in failed (HTTP ${started.status}).`);
  }

  const userCode = (started.data.user_code ?? started.data.usercode)?.trim();
  const deviceAuthId = started.data.device_auth_id?.trim();
  if (!userCode || !deviceAuthId) {
    throw new Error("Codex did not return a device code.");
  }
  const intervalRaw = started.data.interval;
  const intervalSeconds =
    typeof intervalRaw === "string" ? Number(intervalRaw.trim()) : typeof intervalRaw === "number" ? intervalRaw : 5;
  const interval = Number.isFinite(intervalSeconds) && intervalSeconds > 0 ? intervalSeconds : 5;

  void openExternal(`${DEVICE_VERIFICATION_URI}?user_code=${encodeURIComponent(userCode)}`).catch(() => {
    void openExternal(DEVICE_VERIFICATION_URI).catch(() => {
      // The account dialog still shows the code if the browser cannot be opened.
    });
  });

  const expiresAt = Date.now() + DEVICE_TIMEOUT_MS;
  const done = (async (): Promise<ProviderLoginResult> => {
    while (Date.now() < expiresAt) {
      await sleep(interval * 1000, controller.signal);
      const polled = await postJson<{
        authorization_code?: string;
        code_verifier?: string;
        error?: string | { code?: string };
      }>(DEVICE_TOKEN_URL, { device_auth_id: deviceAuthId, user_code: userCode }, controller.signal);

      if (polled.status === 403 || polled.status === 404) continue;
      if (polled.status >= 400) {
        const error = polled.data.error;
        const code = typeof error === "object" ? error?.code : error;
        if (code === "deviceauth_authorization_pending" || code === "authorization_pending") continue;
        if (code === "slow_down") {
          await sleep(5000, controller.signal);
          continue;
        }
        throw new Error(`Codex sign-in failed (HTTP ${polled.status}).`);
      }
      if (!polled.data.authorization_code || !polled.data.code_verifier) continue;
      const tokens = await exchangeCode(
        polled.data.authorization_code,
        polled.data.code_verifier,
        DEVICE_REDIRECT_URI,
        controller.signal,
      );
      return {
        credential: serializeCodexAuthJson(tokens),
        accountId: tokens.accountId,
        suggestedLabel: suggestedLabel(tokens),
      };
    }
    throw new Error("Code expired, try again");
  })();

  return {
    kind: "device_code",
    userCode,
    verificationUri: DEVICE_VERIFICATION_URI,
    done,
    cancel: () => controller.abort(),
  };
}
