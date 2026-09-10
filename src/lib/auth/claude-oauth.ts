import { openUrl } from "@tauri-apps/plugin-opener";
import { fetchJson, fetchText, header, HttpError } from "../platform/http";
import {
  abortError,
  oauthErrorMessage,
  pkceChallenge,
  randomBase64Url,
  type ProviderLoginResult,
  type ProviderLoginSession,
} from "./login-session";

/** Public Claude Code OAuth client. Device/PKCE flow does not use a secret. */
export const CLAUDE_OAUTH_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const AUTHORIZE_URL = "https://claude.ai/oauth/authorize";
// Use the API host for native token exchanges. The console host is protected by
// Cloudflare and can reject non-browser clients before OAuth handles the request.
const TOKEN_URL = "https://api.anthropic.com/v1/oauth/token";
const REDIRECT_URI = "https://console.anthropic.com/oauth/code/callback";
const SCOPE = "org:create_api_key user:profile user:inference";
const PROFILE_URL = "https://api.anthropic.com/api/oauth/profile";

export interface ClaudeOauthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scopes?: string[];
}

export interface ClaudeOauthCredentials {
  claudeAiOauth: ClaudeOauthTokens;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

export function isClaudeOauthJson(raw: string): boolean {
  try {
    const json = JSON.parse(raw) as { claudeAiOauth?: { accessToken?: string } };
    return typeof json.claudeAiOauth?.accessToken === "string";
  } catch {
    return false;
  }
}

export function parseClaudeOauthCredentials(raw: string, describe: string): ClaudeOauthCredentials {
  let json: ClaudeOauthCredentials;
  try {
    json = JSON.parse(raw) as ClaudeOauthCredentials;
  } catch {
    throw new Error(`${describe} is not valid Claude Code credentials JSON.`);
  }
  if (!json.claudeAiOauth?.accessToken) {
    throw new Error(`${describe} is missing an access token.`);
  }
  return json;
}

export function serializeClaudeOauthCredentials(tokens: ClaudeOauthTokens): string {
  return JSON.stringify({ claudeAiOauth: tokens } satisfies ClaudeOauthCredentials);
}

export function parseClaudeCallback(input: string): { code: string; state?: string } {
  const value = input.trim().replace(/^['"]|['"]$/g, "");
  if (!value) throw new Error("Paste the code from the Claude authorization page.");

  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    const fromQuery = url.searchParams.get("code")?.trim();
    const stateFromQuery = url.searchParams.get("state")?.trim() || undefined;
    const hash = url.hash.replace(/^#/, "");
    let codeFromHash: string | undefined;
    let stateFromHash: string | undefined;
    if (hash.includes("code=")) {
      const params = new URLSearchParams(hash);
      codeFromHash = params.get("code")?.trim() || undefined;
      stateFromHash = params.get("state")?.trim() || undefined;
    } else if (hash.includes("#")) {
      const [code, state] = hash.split("#", 2);
      codeFromHash = code.trim() || undefined;
      stateFromHash = state?.trim() || undefined;
    } else if (hash) {
      stateFromHash = hash.trim() || undefined;
    }
    const code = fromQuery || codeFromHash;
    if (code) return { code, state: stateFromQuery || stateFromHash };
  }

  if (value.includes("#")) {
    const [code, state] = value.split("#", 2);
    if (code.trim()) return { code: code.trim(), state: state.trim() || undefined };
  }
  return { code: value };
}

/** Claude Code may store Unix seconds; we persist milliseconds. */
export function expiresAtMs(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return undefined;
  return value < 1e12 ? value * 1000 : value;
}

const DEFAULT_ACCESS_TOKEN_MS = 8 * 60 * 60 * 1000;
const refreshInflight = new Map<string, Promise<ClaudeOauthTokens>>();

async function postToken(
  body: Record<string, string>,
  signal: AbortSignal,
  extraHeaders: Record<string, string> = {},
): Promise<TokenResponse> {
  const res = await fetchText(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "claude-code/2.1.0",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
    signal,
  });
  let data: unknown;
  try {
    data = JSON.parse(res.body) as unknown;
  } catch {
    throw new Error(`Claude sign-in failed: ${res.body.replace(/\s+/g, " ").slice(0, 200)}`);
  }
  if (res.status === 429) {
    const retryAfter = header(res.headers, "retry-after");
    const seconds = retryAfter ? parseInt(retryAfter, 10) || undefined : undefined;
    const blockedAtEdge = header(res.headers, "cf-ray") && !header(res.headers, "request-id");
    throw new HttpError(
      blockedAtEdge
        ? "Cloudflare blocked the Claude sign-in request before it reached Anthropic. Try again later or from another network."
        : seconds
          ? `Claude is rate-limiting sign-in. Try again in ${seconds}s — this app will not keep retrying.`
          : "Claude is rate-limiting sign-in. Wait before trying once more — this app will not keep retrying.",
      429,
      seconds,
    );
  }
  const tokens = data as TokenResponse;
  if (res.status >= 400 || !tokens.access_token) {
    throw new Error(oauthErrorMessage(data, `Claude token request failed (HTTP ${res.status}).`));
  }
  return tokens;
}

function tokensFromResponse(data: TokenResponse, previous?: ClaudeOauthTokens): ClaudeOauthTokens {
  const previousExpiry = expiresAtMs(previous?.expiresAt);
  const expiresAt = data.expires_in
    ? Date.now() + data.expires_in * 1000
    : previousExpiry && previousExpiry > Date.now() + 60_000
      ? previousExpiry
      : Date.now() + DEFAULT_ACCESS_TOKEN_MS;
  return {
    accessToken: data.access_token!,
    refreshToken: data.refresh_token || previous?.refreshToken,
    expiresAt,
    scopes: data.scope?.split(/\s+/).filter(Boolean) ?? previous?.scopes,
  };
}

export async function refreshClaudeOauth(
  tokens: ClaudeOauthTokens,
  signal?: AbortSignal,
): Promise<ClaudeOauthTokens> {
  if (!tokens.refreshToken) {
    throw new Error("Claude session has expired. Sign in again on this account.");
  }
  const key = tokens.refreshToken;
  const existing = refreshInflight.get(key);
  if (existing) return existing;

  const promise = postToken(
    {
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
      client_id: CLAUDE_OAUTH_CLIENT_ID,
    },
    signal ?? new AbortController().signal,
    { "anthropic-beta": "oauth-2025-04-20" },
  )
    .then((data) => tokensFromResponse(data, tokens))
    .finally(() => {
      if (refreshInflight.get(key) === promise) refreshInflight.delete(key);
    });
  refreshInflight.set(key, promise);
  return promise;
}

export async function resolveClaudeOauthTokens(
  tokens: ClaudeOauthTokens,
  signal?: AbortSignal,
): Promise<{ tokens: ClaudeOauthTokens; refreshed: boolean }> {
  const expiresAt = expiresAtMs(tokens.expiresAt);
  const normalized = expiresAt === tokens.expiresAt ? tokens : { ...tokens, expiresAt };
  const expired = expiresAt !== undefined && expiresAt < Date.now() + 60_000;
  if (!expired) return { tokens: normalized, refreshed: false };
  return { tokens: await refreshClaudeOauth(normalized, signal), refreshed: true };
}

async function fetchSuggestedLabel(accessToken: string, signal: AbortSignal): Promise<string | undefined> {
  try {
    const profile = await fetchJson<{ email?: string; account?: { email?: string } }>(PROFILE_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "anthropic-beta": "oauth-2025-04-20",
      },
      signal,
    });
    return profile.email?.trim() || profile.account?.email?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function startClaudeLogin(): Promise<ProviderLoginSession> {
  const controller = new AbortController();
  const verifier = randomBase64Url(32);
  const challenge = pkceChallenge(verifier);
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("code", "true");
  url.searchParams.set("client_id", CLAUDE_OAUTH_CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  // Anthropic's Claude Code authorize endpoint requires state === the PKCE verifier.
  url.searchParams.set("state", verifier);

  void openUrl(url.toString()).catch(() => {
    // The account dialog still shows paste instructions if the browser cannot open.
  });

  let submit: ((code: string) => void) | undefined;
  let rejectSubmit: ((error: Error) => void) | undefined;
  const pasted = new Promise<string>((resolve, reject) => {
    submit = resolve;
    rejectSubmit = reject;
  });

  const onAbort = () => rejectSubmit?.(abortError(controller.signal));
  controller.signal.addEventListener("abort", onAbort, { once: true });

  const done = (async (): Promise<ProviderLoginResult> => {
    const pastedCode = await pasted;
    const parsed = parseClaudeCallback(pastedCode);
    if (parsed.state && parsed.state !== verifier) {
      throw new Error("That code doesn’t match this sign-in. Start again and paste the new code from the page.");
    }
    const data = await postToken(
      {
        grant_type: "authorization_code",
        code: parsed.code,
        state: parsed.state || verifier,
        client_id: CLAUDE_OAUTH_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier,
      },
      controller.signal,
    );
    const tokens = tokensFromResponse(data);
    return {
      credential: serializeClaudeOauthCredentials(tokens),
      suggestedLabel: await fetchSuggestedLabel(tokens.accessToken, controller.signal),
    };
  })().finally(() => {
    controller.signal.removeEventListener("abort", onAbort);
  });

  return {
    kind: "paste_code",
    prompt: "After authorizing in the browser, paste the full code from the Claude page (it looks like abc#xyz).",
    done,
    cancel: () => controller.abort(),
    submitCode: (code: string) => submit?.(code),
  };
}

export function submitClaudeLoginCode(session: ProviderLoginSession, code: string): void {
  if (!session.submitCode) throw new Error("This sign-in is not waiting for a code.");
  session.submitCode(code);
}
