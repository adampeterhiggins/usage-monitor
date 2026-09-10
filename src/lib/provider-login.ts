import { startClaudeLogin, submitClaudeLoginCode } from "./claude-oauth";
import { startCodexLogin } from "./codex-oauth";
import { startCursorLogin } from "./cursor-login";
import { isClaudeOauthJson } from "./claude-oauth";
import type { ProviderLoginSession } from "./login-session";
import type { ProviderId } from "./usage-types";

export type { ProviderLoginResult, ProviderLoginSession } from "./login-session";
export { describeLoginError, isAbortError } from "./login-session";
export { submitClaudeLoginCode };

const activeSessions = new Map<ProviderId, ProviderLoginSession>();

async function createProviderLogin(provider: ProviderId): Promise<ProviderLoginSession> {
  switch (provider) {
    case "claude":
      return startClaudeLogin();
    case "codex":
      return startCodexLogin();
    case "cursor":
      return startCursorLogin();
  }
}

/** In-flight sign-in for this provider, if any. Survives dialog remounts. */
export function peekProviderLogin(provider: ProviderId): ProviderLoginSession | null {
  return activeSessions.get(provider) ?? null;
}

export function cancelProviderLogin(provider: ProviderId): void {
  const session = activeSessions.get(provider);
  if (!session) return;
  activeSessions.delete(provider);
  session.cancel();
}

export async function startProviderLogin(provider: ProviderId): Promise<ProviderLoginSession> {
  const existing = activeSessions.get(provider);
  if (existing) return existing;

  const session = await createProviderLogin(provider);
  activeSessions.set(provider, session);
  void session.done.finally(() => {
    if (activeSessions.get(provider) === session) activeSessions.delete(provider);
  });
  return session;
}

export function credentialLooksLikeSession(provider: ProviderId, credential: string): boolean {
  const cred = credential.trim();
  if (!cred) return false;
  if (provider === "claude") return isClaudeOauthJson(cred) || cred.startsWith("sk-ant-oat");
  if (provider === "codex") return cred.startsWith("{") && cred.includes("access_token");
  return cred.length > 20;
}

export function signInLabel(provider: ProviderId): string {
  switch (provider) {
    case "claude":
      return "Sign in with Claude";
    case "codex":
      return "Sign in with Codex";
    case "cursor":
      return "Sign in with Cursor";
  }
}
