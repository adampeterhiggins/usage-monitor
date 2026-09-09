import { openUrl } from "@tauri-apps/plugin-opener";
import { fetchJson, fetchText } from "./http";

/**
 * Public OAuth App client ID. Device flow does not use the client secret.
 * Enable Device Authorization Grant on the app before signing in.
 */
export const GITHUB_OAUTH_CLIENT_ID = "Ov23liNYGzJS8vLVrBgW";

const DEVICE_CODE_URL = "https://github.com/login/device/code";
const ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
const USER_URL = "https://api.github.com/user";
const SCOPE = "repo";

export type GithubOAuthErrorCode =
  | "expired_token"
  | "access_denied"
  | "device_flow_disabled"
  | "not_configured"
  | "unknown";

export class GithubOAuthError extends Error {
  readonly code: GithubOAuthErrorCode;

  constructor(code: GithubOAuthErrorCode, message: string) {
    super(message);
    this.name = "GithubOAuthError";
    this.code = code;
  }
}

export interface GithubOAuthResult {
  token: string;
  login?: string;
}

export interface GithubDeviceFlowSession {
  userCode: string;
  verificationUri: string;
  expiresAt: number;
  done: Promise<GithubOAuthResult>;
  cancel: () => void;
}

type DeviceCodeResponse = {
  device_code?: string;
  user_code?: string;
  verification_uri?: string;
  verification_uri_complete?: string;
  expires_in?: number;
  interval?: number;
  error?: string;
  error_description?: string;
};

type AccessTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
  interval?: number;
};

function formBody(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The operation was aborted.", "AbortError");
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError(signal));
      return;
    }
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(abortError(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function oauthErrorFromCode(code: string, description?: string): GithubOAuthError {
  if (code === "expired_token") {
    return new GithubOAuthError("expired_token", "Code expired, try again");
  }
  if (code === "access_denied") {
    return new GithubOAuthError("access_denied", "GitHub authorization was denied");
  }
  if (code === "device_flow_disabled") {
    return new GithubOAuthError(
      "device_flow_disabled",
      "Device Flow is disabled on the GitHub OAuth App.",
    );
  }
  return new GithubOAuthError("unknown", description?.trim() || code);
}

export function describeGithubOAuthError(err: unknown): string {
  if (err instanceof DOMException && err.name === "AbortError") return "Sign-in cancelled.";
  if (err instanceof GithubOAuthError) return err.message;
  return err instanceof Error ? err.message : String(err);
}

function parseOauthJson<T>(body: string): T {
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new GithubOAuthError("unknown", `Non-JSON response from GitHub: ${body.slice(0, 200)}`);
  }
}

async function postOauthForm<T extends { error?: string; error_description?: string }>(
  url: string,
  params: Record<string, string>,
  signal: AbortSignal,
): Promise<T> {
  const res = await fetchText(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formBody(params),
    signal,
  });
  const data = parseOauthJson<T>(res.body);
  if (res.status >= 400) {
    if (data.error) throw oauthErrorFromCode(data.error, data.error_description);
    throw new GithubOAuthError(
      "unknown",
      `HTTP ${res.status} from GitHub: ${res.body.replace(/\s+/g, " ").slice(0, 200)}`,
    );
  }
  return data;
}

function requireClientId(clientId: string): string {
  const id = clientId.trim();
  if (!id) {
    throw new GithubOAuthError(
      "not_configured",
      "GitHub OAuth is not configured. Add the OAuth App client ID.",
    );
  }
  return id;
}

export function resolveGithubOAuthClientId(override?: string | null): string {
  return GITHUB_OAUTH_CLIENT_ID.trim() || override?.trim() || "";
}

async function requestDeviceCode(clientId: string, signal: AbortSignal): Promise<DeviceCodeResponse> {
  const data = await postOauthForm<DeviceCodeResponse>(
    DEVICE_CODE_URL,
    { client_id: requireClientId(clientId), scope: SCOPE },
    signal,
  );
  if (data.error) throw oauthErrorFromCode(data.error, data.error_description);
  return data;
}

async function pollAccessToken(
  clientId: string,
  deviceCode: string,
  intervalSeconds: number,
  expiresAt: number,
  signal: AbortSignal,
): Promise<string> {
  let interval = Math.max(intervalSeconds, 5);
  while (Date.now() < expiresAt) {
    await sleep(interval * 1000, signal);
    const data = await postOauthForm<AccessTokenResponse>(
      ACCESS_TOKEN_URL,
      {
        client_id: requireClientId(clientId),
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      },
      signal,
    );
    if (data.access_token) return data.access_token;
    if (!data.error || data.error === "authorization_pending") continue;
    if (data.error === "slow_down") {
      interval = typeof data.interval === "number" && data.interval > 0 ? data.interval : interval + 5;
      continue;
    }
    throw oauthErrorFromCode(data.error, data.error_description);
  }
  throw new GithubOAuthError("expired_token", "Code expired, try again");
}

async function fetchLogin(token: string, signal: AbortSignal): Promise<string | undefined> {
  try {
    const user = await fetchJson<{ login?: string }>(USER_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
      },
      signal,
    });
    return user.login;
  } catch {
    return undefined;
  }
}

export async function startGithubDeviceFlow(
  clientId = GITHUB_OAUTH_CLIENT_ID,
): Promise<GithubDeviceFlowSession> {
  const resolved = requireClientId(clientId);
  const controller = new AbortController();
  const device = await requestDeviceCode(resolved, controller.signal);
  const userCode = device.user_code?.trim();
  const deviceCode = device.device_code?.trim();
  const verificationUri = device.verification_uri?.trim();
  if (!userCode || !deviceCode || !verificationUri) {
    throw new GithubOAuthError("unknown", "GitHub did not return a device code.");
  }
  const verificationUriComplete =
    device.verification_uri_complete?.trim() ||
    `${verificationUri}?user_code=${encodeURIComponent(userCode)}`;
  const expiresAt = Date.now() + (device.expires_in ?? 900) * 1000;
  void openUrl(verificationUriComplete).catch(() => {
    // The settings UI still shows the code if the browser cannot be opened.
  });
  const done = pollAccessToken(
    resolved,
    deviceCode,
    device.interval ?? 5,
    expiresAt,
    controller.signal,
  ).then(async (token) => ({ token, login: await fetchLogin(token, controller.signal) }));
  return {
    userCode,
    verificationUri,
    expiresAt,
    done,
    cancel: () => controller.abort(),
  };
}
