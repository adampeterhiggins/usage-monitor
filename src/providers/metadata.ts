/** Provider display copy: names, accent colors, credential field copy, and
 *  sign-in button labels. Protocol behavior stays in the provider modules. */

import type { ProviderId } from "../contracts/providers";

export interface ProviderMeta {
  id: ProviderId;
  name: string;
  accent: "orange" | "green" | "blue";
  credentialTitle: string;
  credentialHelp: string;
  credentialOptional: boolean;
  credentialPlaceholder: string;
  /** Short name for the native CLI / app login, used in helper copy. */
  nativeLoginName: string;
  /** Dropdown label for pasting a credential. */
  pasteMethodLabel: string;
}

export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  claude: {
    id: "claude",
    name: "Claude",
    accent: "orange",
    credentialTitle: "Session Key",
    credentialHelp:
      "Sign in to give this account its own Claude session, or paste a claude.ai sessionKey (sk-ant-sid01-…). Leave blank to use your Claude Code login from the macOS Keychain.",
    credentialOptional: true,
    credentialPlaceholder: "sk-ant-sid01-…",
    nativeLoginName: "Claude Code",
    pasteMethodLabel: "Paste a session key",
  },
  codex: {
    id: "codex",
    name: "Codex",
    accent: "green",
    credentialTitle: "Auth JSON / Access Token",
    credentialHelp:
      "Sign in to give this account its own Codex session, or paste ~/.codex/auth.json (or its access token). Leave blank to use your Codex CLI login from the macOS Keychain or ~/.codex/auth.json.",
    credentialOptional: true,
    credentialPlaceholder: "auth.json or access token",
    nativeLoginName: "the Codex CLI",
    pasteMethodLabel: "Paste auth.json",
  },
  cursor: {
    id: "cursor",
    name: "Cursor",
    accent: "blue",
    credentialTitle: "Session Cookie",
    credentialHelp:
      "Sign in to give this account its own Cursor session, or paste the WorkosCursorSessionToken cookie. Leave blank to use your Cursor app or cursor-agent login.",
    credentialOptional: true,
    credentialPlaceholder: "WorkosCursorSessionToken",
    nativeLoginName: "Cursor or cursor-agent",
    pasteMethodLabel: "Paste a session cookie",
  },
};

export const PROVIDER_ORDER: ProviderId[] = ["claude", "codex", "cursor"];

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
