import { invoke } from "@tauri-apps/api/core";
import { fetchJson } from "../http";
import { CLAUDE_CODE_KEYCHAIN_SERVICE, listKeychainAccounts, readKeychainPassword } from "../keychain";
import type { Account, UsageSnapshot, UsageWindow } from "../usage-types";

interface UsageBucket {
  utilization?: number | null;
  resets_at?: string | null;
}

interface ClaudeUsageResponse {
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

function parseUsage(data: ClaudeUsageResponse): UsageWindow[] {
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
  claudeAiOauth?: { accessToken?: string; expiresAt?: number };
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
  if (oauth.expiresAt && oauth.expiresAt < Date.now()) {
    throw new Error(`${describe} has expired. Run \`claude\` once to refresh it, then retry.`);
  }
  return { token: oauth.accessToken };
}

/** Read the token from one specific Keychain account the user picked. */
async function readPinnedKeychainToken(account: string): Promise<ClaudeCodeToken> {
  let raw: string;
  try {
    raw = await readKeychainPassword(CLAUDE_CODE_KEYCHAIN_SERVICE, account);
  } catch {
    throw new Error(
      `Keychain login "${account}" no longer exists. Edit this account and pick another Claude Code login.`,
    );
  }
  const result = tokenFrom(raw, `Keychain login "${account}"`);
  return { ...result, source: account };
}

/**
 * Pick a Keychain login automatically: try every entry under the Claude Code
 * service newest-first and use the first one that actually holds a live token.
 * `security` alone returns an arbitrary match, which breaks when a stray entry
 * without a token sits alongside the real login.
 */
async function readAutoKeychainToken(): Promise<ClaudeCodeToken | null> {
  let entries: Array<{ account: string }> = [];
  try {
    entries = await listKeychainAccounts(CLAUDE_CODE_KEYCHAIN_SERVICE);
  } catch {
    entries = [];
  }

  let firstError: Error | undefined;
  for (const entry of entries) {
    try {
      const raw = await readKeychainPassword(CLAUDE_CODE_KEYCHAIN_SERVICE, entry.account);
      const result = tokenFrom(raw, `Keychain login "${entry.account}"`);
      return { ...result, source: entries.length > 1 ? entry.account : undefined };
    } catch (e) {
      firstError ??= e instanceof Error ? e : new Error(String(e));
    }
  }
  if (entries.length > 0 && firstError) {
    throw new Error(
      `${entries.length} Claude Code logins found in the Keychain but none holds a valid token. ${firstError.message}`,
    );
  }

  // Listing failed or found nothing — fall back to whatever `security` returns.
  try {
    const raw = await readKeychainPassword(CLAUDE_CODE_KEYCHAIN_SERVICE);
    return tokenFrom(raw, "Claude Code Keychain login");
  } catch (e) {
    if (e instanceof Error && /missing an access token|has expired/.test(e.message)) throw e;
    return null;
  }
}

async function readClaudeCodeToken(keychainAccount?: string): Promise<ClaudeCodeToken> {
  if (keychainAccount) return readPinnedKeychainToken(keychainAccount);

  const fromKeychain = await readAutoKeychainToken();
  if (fromKeychain) return fromKeychain;

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

async function fetchViaClaudeCode(keychainAccount?: string): Promise<UsageSnapshot> {
  const { token, source } = await readClaudeCodeToken(keychainAccount);
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
  const planLabel = source ? `via Claude Code · ${source}` : "via Claude Code";
  return { planLabel, windows, fetchedAt: Date.now() };
}

export async function fetchClaudeUsage(account: Account): Promise<UsageSnapshot> {
  const cred = account.credential.trim();
  if (cred === "") return fetchViaClaudeCode(account.extra?.trim() || undefined);
  if (/^sk-ant-oat/.test(cred)) {
    throw new Error(
      "That looks like an OAuth token — paste the claude.ai `sessionKey` cookie (sk-ant-sid01-…) instead.",
    );
  }
  try {
    return await fetchViaSessionKey(cred);
  } catch (e) {
    if (e instanceof Error && /HTTP 40[13]/.test(e.message)) {
      throw new Error(
        "claude.ai session expired — copy a fresh `sessionKey` cookie from your browser and edit this account.",
      );
    }
    throw e;
  }
}
