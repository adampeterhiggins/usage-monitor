import { startClaudeLogin, submitClaudeLoginCode } from "../claude/auth";
import { startCodexLogin } from "../codex/auth";
import { startCursorLogin } from "../cursor/auth";
import { isClaudeOauthJson } from "../claude/auth";
import type { ProviderLoginSession } from "./loginSession";
import type { ProviderId } from "../../contracts/providers";

export type { ProviderLoginResult } from "../../contracts/auth";
export type { ProviderLoginSession } from "./loginSession";
export { describeLoginError, isAbortError } from "./loginSession";
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

export { signInLabel } from "../metadata";
