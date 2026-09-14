import { openExternal } from "../../platform/external";
import { fetchJson } from "../../platform/http";
import type { ProviderLoginResult } from "../../contracts/auth";
import {
  abortError,
  pkceChallenge,
  randomBase64Url,
  type ProviderLoginSession,
} from "../shared/loginSession";

/** The Devin CLI keeps its login here as plain TOML — not in the Keychain. */
export const DEVIN_CREDENTIALS_PATH = ".local/share/devin/credentials.toml";

/**
 * The CLI identifies itself to the Codeium backend as `chisel` (its internal
 * crate name), and the backend branches on it: sending `devin` instead is
 * rejected with `permission_denied: "You need a full seat"` even when the key
 * is valid. Keep these values in step with a real CLI build.
 */
export const DEVIN_CLIENT = {
  ide_name: "chisel",
  ide_version: "3000.10.21",
  extension_name: "chisel",
  extension_version: "3000.10.21",
} as const;

const AUTHORIZE_URL = "https://app.devin.ai/auth/cli/continue";
const EXCHANGE_URL =
  "https://server.codeium.com/exa.seat_management_pb.SeatManagementService/ExchangeDevinCLIPKCECode";
const USER_STATUS_URL =
  "https://server.codeium.com/exa.seat_management_pb.SeatManagementService/GetUserStatus";

/**
 * The CLI redirects to a loopback server it spins up for the sign-in. This app
 * has no listener, so the browser lands on an unreachable page whose address
 * bar holds the code — the same paste-the-code shape the Claude flow uses.
 */
const REDIRECT_URI = "http://127.0.0.1:51703/callback";

/** Pull the API key out of the CLI's `credentials.toml`. */
export function parseDevinCredentialsToml(raw: string, describe: string): string {
  const match = raw.match(/^\s*windsurf_api_key\s*=\s*"([^"]+)"/m);
  const key = match?.[1]?.trim();
  if (!key) throw new Error(`${describe} has no windsurf_api_key. Run \`devin auth login\`.`);
  return key;
}

/** Accept either a bare API key or the whole `credentials.toml` file. */
export function devinApiKey(raw: string, describe: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error(`${describe} is empty.`);
  if (trimmed.includes("windsurf_api_key")) return parseDevinCredentialsToml(trimmed, describe);
  if (/\s/.test(trimmed)) {
    throw new Error(`${describe} is not a Devin API key or a credentials.toml file.`);
  }
  return trimmed;
}

/** Read the code out of a pasted callback URL, or accept a bare code. */
export function parseDevinCallback(input: string): { code: string; state?: string } {
  const value = input.trim().replace(/^['"]|['"]$/g, "");
  if (!value) throw new Error("Paste the code from the Devin sign-in page.");

  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    const code = url.searchParams.get("code")?.trim();
    const state = url.searchParams.get("state")?.trim() || undefined;
    if (!code) throw new Error("That URL has no `code` parameter. Copy the whole address bar.");
    return { code, state };
  }
  return { code: value };
}

interface ExchangeResponse {
  sessionToken?: string;
  session_token?: string;
  apiKey?: string;
  api_key?: string;
}

function tokenFromExchange(data: ExchangeResponse): string {
  const token = data.sessionToken ?? data.session_token ?? data.apiKey ?? data.api_key;
  const trimmed = typeof token === "string" ? token.trim() : "";
  if (!trimmed) throw new Error("Devin sign-in returned an empty session token.");
  return trimmed;
}

async function fetchSuggestedLabel(apiKey: string, signal: AbortSignal): Promise<string | undefined> {
  try {
    const data = await fetchJson<{ userStatus?: { email?: string; name?: string } }>(USER_STATUS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "connect-protocol-version": "1" },
      body: JSON.stringify({ metadata: { api_key: apiKey, ...DEVIN_CLIENT } }),
      signal,
    });
    return data.userStatus?.email?.trim() || data.userStatus?.name?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function startDevinLogin(): Promise<ProviderLoginSession> {
  const controller = new AbortController();
  const verifier = randomBase64Url(32);
  const state = randomBase64Url(16);
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  url.searchParams.set("code_challenge", pkceChallenge(verifier));
  url.searchParams.set("code_challenge_method", "S256");

  void openExternal(url.toString()).catch(() => {
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
    const parsed = parseDevinCallback(await pasted);
    if (parsed.state && parsed.state !== state) {
      throw new Error("That code doesn’t match this sign-in. Start again and paste the new address.");
    }
    const data = await fetchJson<ExchangeResponse>(EXCHANGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "connect-protocol-version": "1" },
      body: JSON.stringify({ code: parsed.code, code_verifier: verifier }),
      signal: controller.signal,
    });
    const credential = tokenFromExchange(data);
    return {
      credential,
      suggestedLabel: await fetchSuggestedLabel(credential, controller.signal),
    };
  })().finally(() => {
    controller.signal.removeEventListener("abort", onAbort);
  });

  return {
    kind: "paste_code",
    prompt:
      "Finish signing in in your browser. The last page will fail to load — paste its full address here.",
    verificationUri: url.toString(),
    done,
    cancel: () => controller.abort(),
    submitCode: (code: string) => submit?.(code),
  };
}
