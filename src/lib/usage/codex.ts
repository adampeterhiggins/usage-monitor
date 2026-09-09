import { invoke } from "@tauri-apps/api/core";
import { accountIdFromAccessToken, parseCodexAuthJson, refreshCodexOauth, serializeCodexAuthJson } from "../codex-oauth";
import { fetchJson } from "../http";
import { KEYCHAIN_LOGINS, resolveKeychainCredential } from "../keychain";
import type { Account, UsageSnapshot, UsageWindow } from "../usage-types";

interface RateLimitWindow {
  used_percent?: number | null;
  limit_window_seconds?: number | null;
  reset_after_seconds?: number | null;
  reset_at?: number | null;
}

interface WhamUsage {
  plan_type?: string;
  email?: string;
  rate_limit?: {
    primary_window?: RateLimitWindow | null;
    secondary_window?: RateLimitWindow | null;
  } | null;
  additional_rate_limits?: Array<{
    limit_name?: string | null;
    rate_limit?: { primary_window?: RateLimitWindow | null; secondary_window?: RateLimitWindow | null } | null;
  }> | null;
  credits?: { balance?: string | null; unlimited?: boolean | null } | null;
}

interface CodexCreds {
  accessToken: string;
  accountId?: string;
}

const AUTH_FILE = ".codex/auth.json";

async function readAuthFile(rel: string): Promise<CodexCreds | null> {
  let raw: string;
  try {
    raw = await invoke<string>("read_home_file", { relPath: rel });
  } catch {
    return null;
  }
  return parseAuthJson(raw, `~/${rel}`);
}

/**
 * Native mode: the Codex CLI keeps its login either in the macOS Keychain
 * (`cli_auth_credentials_store = "keyring"`) or in ~/.codex/auth.json. Try the
 * Keychain first, then the file. `keychainAccount` pins one Keychain entry.
 */
async function resolveNativeCreds(keychainAccount?: string): Promise<CodexCreds> {
  const fromKeychain = await resolveKeychainCredential(KEYCHAIN_LOGINS.codex!, keychainAccount, parseAuthJson);
  if (fromKeychain) return fromKeychain.value;

  const fromFile = await readAuthFile(AUTH_FILE);
  if (fromFile) return fromFile;

  throw new Error(
    "Codex login not found in the Keychain or ~/.codex/auth.json. Run `codex login`, or paste the auth.json contents.",
  );
}

async function resolveCreds(account: Account): Promise<CodexCreds> {
  const cred = account.credential.trim();

  if (cred.startsWith("{")) return parseAuthJson(cred, "Pasted credential");

  if (cred === "") return resolveNativeCreds(account.extra?.trim() || undefined);

  if (cred.startsWith("/") || cred.startsWith("~")) {
    const rel = cred === "~/.codex/auth.json" || cred === "~/.codex" ? AUTH_FILE : cred.replace(/^~\//, "");
    if (rel.startsWith("/")) {
      throw new Error("Paste the auth.json contents, or leave blank to use your Codex CLI login.");
    }
    const creds = await readAuthFile(rel);
    if (!creds) {
      throw new Error(`Could not read ~/${rel}. Log in with the Codex CLI first, or paste the auth.json contents.`);
    }
    return creds;
  }

  return { accessToken: cred, accountId: account.extra };
}

function parseAuthJson(raw: string, describe: string): CodexCreds {
  let json: { tokens?: { access_token?: string; account_id?: string }; OPENAI_API_KEY?: string };
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`${describe} is not valid JSON (expected auth.json contents).`);
  }
  const token = json.tokens?.access_token;
  if (!token) {
    throw new Error(
      json.OPENAI_API_KEY
        ? `${describe} uses an API key login — usage limits need a ChatGPT login (sign in below, or run \`codex login\`).`
        : `${describe} has no tokens.access_token.`,
    );
  }
  return { accessToken: token, accountId: json.tokens?.account_id || accountIdFromAccessToken(token) };
}

function windowLabel(w: RateLimitWindow, fallback: string): string {
  const secs = w.limit_window_seconds ?? 0;
  if (!secs) return fallback;
  const hours = secs / 3600;
  if (hours <= 24) return `${Math.round(hours)}h limit`;
  const days = hours / 24;
  if (Math.round(days) === 7) return "Weekly limit";
  return `${Math.round(days)}-day limit`;
}

function toWindow(
  w: RateLimitWindow | null | undefined,
  fallbackLabel: string,
  prefix = "",
): UsageWindow | null {
  if (!w || w.used_percent === undefined || w.used_percent === null) return null;
  return {
    label: `${prefix}${windowLabel(w, fallbackLabel)}`,
    usedPercent: w.used_percent,
    resetsAt: w.reset_at ? w.reset_at * 1000 : undefined,
  };
}

async function fetchWham(creds: CodexCreds): Promise<WhamUsage> {
  const headers: Record<string, string> = { Authorization: `Bearer ${creds.accessToken}` };
  if (creds.accountId) headers["ChatGPT-Account-Id"] = creds.accountId;
  return fetchJson<WhamUsage>("https://chatgpt.com/backend-api/wham/usage", { headers });
}

async function refreshStoredCodex(account: Account, cred: string): Promise<CodexCreds | null> {
  if (!cred.startsWith("{")) return null;
  let tokens;
  try {
    tokens = parseCodexAuthJson(cred, "Saved Codex login");
  } catch {
    return null;
  }
  if (!tokens.refreshToken) return null;
  const next = await refreshCodexOauth(tokens);
  try {
    const { replaceAccountCredential } = await import("../accounts");
    await replaceAccountCredential(account.id, serializeCodexAuthJson(next));
  } catch {
    // Usage still works this session even if the store write fails.
  }
  return { accessToken: next.accessToken, accountId: next.accountId };
}

export async function fetchCodexUsage(account: Account): Promise<UsageSnapshot> {
  const creds = await resolveCreds(account);

  let data: WhamUsage;
  try {
    data = await fetchWham(creds);
  } catch (e) {
    if (e instanceof Error && /HTTP 401/.test(e.message)) {
      const refreshed = await refreshStoredCodex(account, account.credential.trim()).catch(() => null);
      if (refreshed) {
        data = await fetchWham(refreshed);
      } else {
        throw new Error("Codex token expired. Sign in again on this account, or run `codex login` and retry.");
      }
    } else {
      throw e;
    }
  }

  const windows: UsageWindow[] = [];
  const primary = toWindow(data.rate_limit?.primary_window, "Usage limit");
  const secondary = toWindow(data.rate_limit?.secondary_window, "Weekly limit");
  if (primary) windows.push(primary);
  if (secondary) windows.push(secondary);
  for (const extra of data.additional_rate_limits ?? []) {
    const name = extra.limit_name ? `${extra.limit_name} · ` : "";
    const p = toWindow(extra.rate_limit?.primary_window, "limit", name);
    const s = toWindow(extra.rate_limit?.secondary_window, "weekly", name);
    if (p) windows.push(p);
    if (s) windows.push(s);
  }
  if (windows.length === 0) {
    windows.push({ label: "Usage limit", detail: "No rate-limit windows reported" });
  }
  if (data.credits?.balance) {
    windows.push({ label: "Credits", detail: `$${data.credits.balance} balance` });
  }

  const plan = data.plan_type ? data.plan_type.charAt(0).toUpperCase() + data.plan_type.slice(1) : undefined;
  return {
    planLabel: [plan, data.email].filter(Boolean).join(" · ") || undefined,
    windows,
    fetchedAt: Date.now(),
  };
}
