import { invoke } from "@tauri-apps/api/core";
import { fetchJson } from "../http";
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

async function resolveCreds(account: Account): Promise<CodexCreds> {
  const cred = account.credential.trim();

  if (cred.startsWith("{")) return parseAuthJson(cred);

  if (cred === "" || cred.startsWith("/") || cred.startsWith("~")) {
    const rel =
      cred === "" || cred === "~/.codex/auth.json" || cred === "~/.codex"
        ? ".codex/auth.json"
        : cred.replace(/^~\//, "");
    if (rel.startsWith("/")) {
      throw new Error("Paste the auth.json contents, or leave blank to auto-read ~/.codex/auth.json.");
    }
    const raw = await invoke<string>("read_home_file", { relPath: rel }).catch(() => {
      throw new Error(
        `Could not read ~/${rel}. Log in with the Codex CLI first, or paste the auth.json contents.`,
      );
    });
    return parseAuthJson(raw);
  }

  return { accessToken: cred, accountId: account.extra };
}

function parseAuthJson(raw: string): CodexCreds {
  let json: { tokens?: { access_token?: string; account_id?: string }; OPENAI_API_KEY?: string };
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("Credential is not valid JSON (expected ~/.codex/auth.json contents).");
  }
  const token = json.tokens?.access_token;
  if (!token) {
    throw new Error(
      json.OPENAI_API_KEY
        ? "This auth.json uses an API key login — usage limits need a ChatGPT login (run `codex login`)."
        : "auth.json has no tokens.access_token.",
    );
  }
  return { accessToken: token, accountId: json.tokens?.account_id };
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

export async function fetchCodexUsage(account: Account): Promise<UsageSnapshot> {
  const creds = await resolveCreds(account);
  const headers: Record<string, string> = { Authorization: `Bearer ${creds.accessToken}` };
  if (creds.accountId) headers["ChatGPT-Account-Id"] = creds.accountId;

  let data: WhamUsage;
  try {
    data = await fetchJson<WhamUsage>("https://chatgpt.com/backend-api/wham/usage", { headers });
  } catch (e) {
    if (e instanceof Error && /HTTP 401/.test(e.message)) {
      throw new Error("Codex token expired. Run any `codex` command (or `codex login`) to refresh it, then retry.");
    }
    throw e;
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
