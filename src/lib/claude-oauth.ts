import { openUrl } from "@tauri-apps/plugin-opener";
import { fetchJson, fetchText } from "./http";
import {
  abortError,
  pkceChallenge,
  randomBase64Url,
  type ProviderLoginResult,
  type ProviderLoginSession,
} from "./login-session";

/** Public Claude Code OAuth client. Device/PKCE flow does not use a secret. */
export const CLAUDE_OAUTH_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const AUTHORIZE_URL = "https://claude.ai/oauth/authorize";
const TOKEN_URL = "https://console.anthropic.com/v1/oauth/token";
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
  const value = input.trim();
  if (!value) throw new Error("Paste the code from the Claude authorization page.");

  try {
    const url = new URL(value);
    const fromQuery = url.searchParams.get("code")?.trim();
    if (fromQuery) return { code: fromQuery, state: url.searchParams.get("state")?.trim() || undefined };
    const hash = url.hash.replace(/^#/, "");
    if (hash.includes("code=")) {
      const params = new URLSearchParams(hash);
      const code = params.get("code")?.trim();
      if (code) return { code, state: params.get("state")?.trim() || undefined };
    }
    if (hash.includes("#")) {
      const [code, state] = hash.split("#", 2);
      if (code.trim()) return { code: code.trim(), state: state?.trim() };
    }
  } catch {
    // Not a URL — fall through to code#state / raw code.
  }

  if (value.includes("#")) {
    const [code, state] = value.split("#", 2);
    if (code.trim()) return { code: code.trim(), state: state.trim() || undefined };
  }
  return { code: value };
}

async function postToken(body: Record<string, string>, signal: AbortSignal): Promise<TokenResponse> {
  const res = await fetchText(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });
  let data: TokenResponse & { error?: string; error_description?: string };
  try {
    data = JSON.parse(res.body) as TokenResponse & { error?: string; error_description?: string };
  } catch {
    throw new Error(`Claude sign-in failed: ${res.body.replace(/\s+/g, " ").slice(0, 200)}`);
  }
  if (res.status >= 400 || !data.access_token) {
    throw new Error(data.error_description?.trim() || data.error?.trim() || `Claude token request failed (HTTP ${res.status}).`);
  }
  return data;
}

function tokensFromResponse(data: TokenResponse, previous?: ClaudeOauthTokens): ClaudeOauthTokens {
  return {
    accessToken: data.access_token!,
    refreshToken: data.refresh_token || previous?.refreshToken,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : previous?.expiresAt,
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
  const data = await postToken(
    {
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
      client_id: CLAUDE_OAUTH_CLIENT_ID,
    },
    signal ?? new AbortController().signal,
  );
  return tokensFromResponse(data, tokens);
}

export async function resolveClaudeOauthTokens(
  tokens: ClaudeOauthTokens,
  signal?: AbortSignal,
): Promise<{ tokens: ClaudeOauthTokens; refreshed: boolean }> {
  const expired = tokens.expiresAt !== undefined && tokens.expiresAt < Date.now() + 60_000;
  if (!expired) return { tokens, refreshed: false };
  return { tokens: await refreshClaudeOauth(tokens, signal), refreshed: true };
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
    prompt: "After authorizing in the browser, paste the code from the Claude page.",
    done,
    cancel: () => controller.abort(),
    submitCode: (code: string) => submit?.(code),
  };
}

export function submitClaudeLoginCode(session: ProviderLoginSession, code: string): void {
  if (!session.submitCode) throw new Error("This sign-in is not waiting for a code.");
  session.submitCode(code);
}
