/** Provider display copy: names, accent colors, credential field copy, and
 *  sign-in button labels. Protocol behavior stays in the provider modules. */

import type { ProviderId } from "../contracts/providers";
import type { UiProviderTone } from "../lib/theme/ui-tokens";

export interface ProviderMeta {
  id: ProviderId;
  name: string;
  tone: UiProviderTone;
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
    tone: "orange",
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
    tone: "green",
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
    tone: "blue",
    credentialTitle: "Session Cookie",
    credentialHelp:
      "Sign in to give this account its own Cursor session, or paste the WorkosCursorSessionToken cookie. Leave blank to use your Cursor app or cursor-agent login.",
    credentialOptional: true,
    credentialPlaceholder: "WorkosCursorSessionToken",
    nativeLoginName: "Cursor or cursor-agent",
    pasteMethodLabel: "Paste a session cookie",
  },
  devin: {
    id: "devin",
    name: "Devin",
    tone: "purple",
    credentialTitle: "API Key",
    credentialHelp:
      "Sign in to give this account its own Devin session, or paste the windsurf_api_key from ~/.local/share/devin/credentials.toml (the whole file works too). Leave blank to use your Devin CLI login.",
    credentialOptional: true,
    credentialPlaceholder: "windsurf_api_key or credentials.toml",
    nativeLoginName: "the Devin CLI",
    pasteMethodLabel: "Paste an API key",
  },
  grok: {
    id: "grok",
    name: "Grok",
    tone: "slate",
    credentialTitle: "Access Token",
    credentialHelp:
      "Paste the access token from ~/.grok/auth.json (the whole file works too). Leave blank to use your Grok CLI login.",
    credentialOptional: true,
    credentialPlaceholder: "access token or auth.json",
    nativeLoginName: "the Grok CLI",
    pasteMethodLabel: "Paste an access token",
  },
  opencode: {
    id: "opencode",
    name: "OpenCode",
    tone: "teal",
    credentialTitle: "API Key",
    credentialHelp:
      "Paste your OpenCode Go API key, or ~/.local/share/opencode/auth.json. Leave blank to use your OpenCode login.",
    credentialOptional: true,
    credentialPlaceholder: "OpenCode Go API key or auth.json",
    nativeLoginName: "OpenCode",
    pasteMethodLabel: "Paste an API key",
  },
};

export const PROVIDER_ORDER: ProviderId[] = ["claude", "codex", "cursor", "devin", "grok", "opencode"];

export function signInLabel(provider: ProviderId): string {
  switch (provider) {
    case "claude":
      return "Sign in with Claude";
    case "codex":
      return "Sign in with Codex";
    case "cursor":
      return "Sign in with Cursor";
    case "devin":
      return "Sign in with Devin";
    case "grok":
      return "Sign in with Grok";
    case "opencode":
      return "Sign in with OpenCode";
  }
}
