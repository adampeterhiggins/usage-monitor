import {
  isClaudeOauthJson,
  startClaudeBrowserLogin,
  startClaudePasteCodeLogin,
} from "../claude/auth";
import { startCodexBrowserLogin, startCodexDeviceCodeLogin } from "../codex/auth";
import { startCursorLogin } from "../cursor/auth";
import { credentialUserId } from "../cursor/usage";
import { startDevinBrowserLogin, startDevinPasteCodeLogin } from "../devin/auth";
import type { ProviderLoginSession } from "./loginSession";
import type { ProviderId } from "../../contracts/providers";

export type { ProviderLoginResult } from "../../contracts/auth";
export type { ProviderLoginSession } from "./loginSession";
export { describeLoginError, isAbortError, submitLoginCode } from "./loginSession";

/** One selectable way to run a provider's managed sign-in. */
export interface ProviderLoginMethod {
  id: string;
  label: string;
  description?: string;
  start: () => Promise<ProviderLoginSession>;
}

/**
 * Sign-in methods per provider, best first — the loopback browser flow is
 * always the default, with the paste/device-code variants kept for
 * environments whose browser cannot reach this Mac's loopback listener.
 */
const LOGIN_METHODS: Record<ProviderId, ProviderLoginMethod[]> = {
  claude: [
    {
      id: "browser",
      label: "Sign in with browser",
      description: "Opens claude.ai and finishes here automatically.",
      start: startClaudeBrowserLogin,
    },
    {
      id: "paste-code",
      label: "Paste a sign-in code",
      description: "The authorize page shows a code to paste back.",
      start: startClaudePasteCodeLogin,
    },
  ],
  codex: [
    {
      id: "browser",
      label: "Sign in with browser",
      description: "Opens ChatGPT sign-in and finishes here automatically.",
      start: startCodexBrowserLogin,
    },
    {
      id: "device-code",
      label: "Use a device code",
      description: "Enter a code on the sign-in page — some orgs disable this.",
      start: startCodexDeviceCodeLogin,
    },
  ],
  cursor: [
    {
      id: "browser",
      label: "Sign in with browser",
      description: "Finish signing in in your browser — passkeys work there.",
      start: startCursorLogin,
    },
  ],
  devin: [
    {
      id: "browser",
      label: "Sign in with browser",
      description: "Opens app.devin.ai and finishes here automatically.",
      start: startDevinBrowserLogin,
    },
    {
      id: "paste-code",
      label: "Paste a redirect URL",
      description: "The final page fails to load — paste its address back.",
      start: startDevinPasteCodeLogin,
    },
  ],
};

export function providerLoginMethods(provider: ProviderId): ReadonlyArray<ProviderLoginMethod> {
  return LOGIN_METHODS[provider];
}

const activeSessions = new Map<ProviderId, ProviderLoginSession>();

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

export async function startProviderLogin(
  provider: ProviderId,
  methodId?: string,
): Promise<ProviderLoginSession> {
  const existing = activeSessions.get(provider);
  if (existing) return existing;

  const methods = LOGIN_METHODS[provider];
  const method = methods.find((candidate) => candidate.id === methodId) ?? methods[0];
  const session = await method.start();
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
  if (provider === "devin") return !cred.includes("windsurf_api_key") && cred.length > 40;
  return cred.length > 20;
}

/** A comparable identity for a credential — the same underlying provider user
 *  yields the same value even when the stored tokens differ (two Cursor
 *  sign-ins mint different JWTs for one user). Falls back to the raw
 *  credential so identical pasted secrets still match; undefined when there
 *  is no credential to compare. */
export function credentialIdentity(
  provider: ProviderId,
  credential: string,
  accountId?: string,
): string | undefined {
  const cred = credential.trim();
  if (!cred) return undefined;
  if (provider === "cursor") {
    const userId = credentialUserId(cred);
    if (userId) return `user:${userId}`;
  }
  if (provider === "codex" && accountId?.trim()) return `acct:${accountId.trim()}`;
  return `cred:${cred}`;
}

export { signInLabel } from "../metadata";
