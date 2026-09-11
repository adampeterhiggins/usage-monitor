import { invoke } from "@tauri-apps/api/core";
import {
  isClaudeOauthJson,
  parseClaudeOauthCredentials,
  resolveClaudeOauthTokens,
  serializeClaudeOauthCredentials,
} from "../auth/claude-oauth";
import { fetchJson } from "../platform/http";
import { KEYCHAIN_LOGINS, resolveKeychainCredential } from "../auth/keychain";
import type { Account } from "../contracts/accounts";
import { authCredential, authLocalSelector } from "../contracts/auth";
import type { UsageFetchHooks, UsageSnapshot, UsageWindow } from "../contracts/usage";

interface UsageBucket {
  utilization?: number | null;
  resets_at?: string | null;
}

export interface ClaudeUsageResponse {
  five_hour?: UsageBucket | null;
  seven_day?: UsageBucket | null;
  seven_day_sonnet?: UsageBucket | null;
  seven_day_opus?: UsageBucket | null;
  seven_day_cowork?: UsageBucket | null;
  extra_usage?: {
    is_enabled?: boolean;
    monthly_limit?: number | null;
    used_credits?: number | null;
    utilization?: number | null;
    currency?: string | null;
    decimal_places?: number | null;
  } | null;
  limits?: Array<{
    kind?: string;
    group?: string;
    percent?: number | null;
    is_active?: boolean;
    resets_at?: string | null;
    scope?: { model?: { id?: string; display_name?: string } } | null;
  }> | null;
}

function ms(iso?: string | null): number | undefined {
  if (!iso) return undefined;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? undefined : t;
}

function bucket(label: string, b?: UsageBucket | null): UsageWindow | null {
  if (!b || b.utilization === undefined || b.utilization === null) return null;
  return { label, usedPercent: b.utilization, resetsAt: ms(b.resets_at) };
}

export function parseUsage(data: ClaudeUsageResponse): UsageWindow[] {
  const windows: UsageWindow[] = [];
  const seen = new Set<string>();
  const push = (w: UsageWindow | null) => {
    if (w && !seen.has(w.label)) {
      seen.add(w.label);
      windows.push(w);
    }
  };

  push(bucket("Current session", data.five_hour));
  push(bucket("Weekly · All models", data.seven_day));
  push(bucket("Weekly · Opus", data.seven_day_opus));
  push(bucket("Weekly · Sonnet", data.seven_day_sonnet));
  push(bucket("Weekly · Cowork", data.seven_day_cowork));

  for (const limit of data.limits ?? []) {
    if (limit.percent === undefined || limit.percent === null) continue;
    const model = limit.scope?.model?.display_name;
    const group = limit.group?.toLowerCase() ?? "";
    const kind = limit.kind?.toLowerCase() ?? "";
    const label = model
      ? `Weekly · ${model}`
      : group.includes("session") || kind.includes("session")
        ? "Current session"
        : group === "weekly" || kind.includes("weekly")
          ? "Weekly · All models"
          : (limit.kind ?? "Limit");
    push({ label, usedPercent: limit.percent, resetsAt: ms(limit.resets_at) });
  }

  const extra = data.extra_usage;
  if (extra?.is_enabled && extra.monthly_limit) {
    const dp = extra.decimal_places ?? 2;
    windows.push({
      label: "Extra usage",
      usedPercent: extra.utilization ?? ((extra.used_credits ?? 0) / extra.monthly_limit) * 100,
      detail: `${money(extra.used_credits ?? 0, extra.currency, dp)} of ${money(extra.monthly_limit, extra.currency, dp)}`,
    });
  }
  return windows;
}

const CURRENCY_SYMBOLS: Record<string, string> = { usd: "$", gbp: "£", eur: "€" };

function money(minor: number, currency?: string | null, decimals = 2): string {
  const code = (currency ?? "usd").toLowerCase();
  const amount = (minor / 10 ** decimals).toFixed(decimals);
  const symbol = CURRENCY_SYMBOLS[code];
  return symbol ? `${symbol}${amount}` : `${amount} ${code.toUpperCase()}`;
}

async function fetchViaSessionKey(sessionKey: string): Promise<UsageSnapshot> {
  const headers = {
    Cookie: `sessionKey=${sessionKey}`,
    Referer: "https://claude.ai/settings/usage",
    Origin: "https://claude.ai",
  };
  const orgs = await fetchJson<Array<{ uuid: string; name?: string; capabilities?: string[] }>>(
    "https://claude.ai/api/organizations",
    { headers },
  );
  if (!Array.isArray(orgs) || orgs.length === 0) {
    throw new Error("No organizations found for this session key.");
  }
  const org =
    orgs.find((o) => o.capabilities?.includes("chat")) ??
    orgs.find((o) => !(o.capabilities?.length === 1 && o.capabilities[0] === "api")) ??
    orgs[0];

  const data = await fetchJson<ClaudeUsageResponse>(
    `https://claude.ai/api/organizations/${org.uuid}/usage`,
    { headers },
  );
  const windows = parseUsage(data);
  if (windows.length === 0) windows.push({ label: "Usage", detail: "No usage windows reported" });
  return { planLabel: org.name, windows, fetchedAt: Date.now() };
}

interface ClaudeCodeCredentials {
  claudeAiOauth?: { accessToken?: string; refreshToken?: string; expiresAt?: number };
}

interface ClaudeCodeToken {
  token: string;
  /** Keychain account the token came from, when it came from the Keychain. */
  source?: string;
}

function parseCredentials(raw: string): ClaudeCodeCredentials | null {
  try {
    return JSON.parse(raw) as ClaudeCodeCredentials;
  } catch {
    return null;
  }
}

function tokenFrom(raw: string, describe: string): ClaudeCodeToken {
  const oauth = parseCredentials(raw)?.claudeAiOauth;
  if (!oauth?.accessToken) throw new Error(`${describe} is missing an access token.`);
  if (oauth.expiresAt && oauth.expiresAt < Date.now() && !oauth.refreshToken) {
    throw new Error(`${describe} has expired. Sign in again on this account, or run \`claude\` once to refresh it.`);
  }
  return { token: oauth.accessToken };
}

async function readClaudeCodeToken(keychainAccount?: string): Promise<ClaudeCodeToken> {
  const fromKeychain = await resolveKeychainCredential(KEYCHAIN_LOGINS.claude!, keychainAccount, tokenFrom);
  if (fromKeychain) return { ...fromKeychain.value, source: fromKeychain.source };

  let raw: string | undefined;
  try {
    raw = await invoke<string>("read_home_file", { relPath: ".claude/.credentials.json" });
  } catch {
    raw = undefined;
  }
  if (!raw) {
    throw new Error(
      "Claude Code credentials not found. Log in with `claude`, or paste a claude.ai sessionKey instead.",
    );
  }
  return tokenFrom(raw, "~/.claude/.credentials.json");
}

async function fetchViaAccessToken(token: string, planLabel: string): Promise<UsageSnapshot> {
  const data = await fetchJson<ClaudeUsageResponse>("https://api.anthropic.com/api/oauth/usage", {
    headers: {
      Authorization: `Bearer ${token}`,
      "anthropic-beta": "oauth-2025-04-20",
      "User-Agent": "claude-code/2.1.0",
      "Content-Type": "application/json",
    },
  });
  const windows = parseUsage(data);
  if (windows.length === 0) windows.push({ label: "Usage", detail: "No usage windows reported" });
  return { planLabel, windows, fetchedAt: Date.now() };
}

async function fetchViaClaudeCode(keychainAccount?: string): Promise<UsageSnapshot> {
  const { token, source } = await readClaudeCodeToken(keychainAccount);
  const planLabel = source ? `via Claude Code · ${source}` : "via Claude Code";
  return fetchViaAccessToken(token, planLabel);
}

async function fetchViaStoredOauth(
  cred: string,
  hooks?: UsageFetchHooks,
): Promise<UsageSnapshot> {
  if (cred.startsWith("sk-ant-oat")) {
    return fetchViaAccessToken(cred, "Signed in");
  }
  const stored = parseClaudeOauthCredentials(cred, "Saved Claude login");
  const { tokens, refreshed } = await resolveClaudeOauthTokens(stored.claudeAiOauth);
  if (refreshed) {
    try {
      await hooks?.persistCredential?.(serializeClaudeOauthCredentials(tokens));
    } catch {
      // Usage still works this session even if the store write fails.
    }
  }
  return fetchViaAccessToken(tokens.accessToken, "Signed in");
}

export async function fetchClaudeUsage(
  account: Account,
  hooks?: UsageFetchHooks,
): Promise<UsageSnapshot> {
  const cred = authCredential(account.auth).trim();
  if (cred === "") return fetchViaClaudeCode(authLocalSelector(account.auth));
  if (isClaudeOauthJson(cred) || /^sk-ant-oat/.test(cred)) {
    try {
      return await fetchViaStoredOauth(cred, hooks);
    } catch (e) {
      if (e instanceof Error && /HTTP 40[13]/.test(e.message)) {
        throw new Error("Claude session expired — sign in again on this account.");
      }
      throw e;
    }
  }
  try {
    return await fetchViaSessionKey(cred);
  } catch (e) {
    if (e instanceof Error && /HTTP 40[13]/.test(e.message)) {
      throw new Error(
        "claude.ai session expired — sign in again, or copy a fresh `sessionKey` cookie from your browser.",
      );
    }
    throw e;
  }
}
