import { readHomeFile } from "../../platform/credentials";
import { fetchJson, HttpError } from "../../platform/http";
import type { Account } from "../../contracts/accounts";
import { authCredential } from "../../contracts/auth";
import type { UsageSnapshot, UsageWindow } from "../../contracts/usage";
import { OPENCODE_AUTH_PATH, openCodeApiKey } from "./auth";

/** OpenCode Go's quota read. T3 Code reads the same endpoint. */
const USAGE_URL = "https://opencode.ai/zen/go/v1/usage";

interface GoWindow {
  percent?: number;
  resetsAt?: string;
}

export interface OpenCodeGoUsageResponse {
  usage?: { rolling?: GoWindow; weekly?: GoWindow; monthly?: GoWindow };
}

function goWindow(label: string, window: GoWindow | undefined): UsageWindow | undefined {
  const percent = window?.percent;
  if (typeof percent !== "number" || !Number.isFinite(percent)) return undefined;
  const resetsAt = window?.resetsAt ? Date.parse(window.resetsAt) : NaN;
  return {
    label,
    usedPercent: Math.min(100, Math.max(0, percent)),
    resetsAt: Number.isFinite(resetsAt) ? resetsAt : undefined,
  };
}

/** Translate Go's usage reply into the app's provider-neutral meters. The
 *  rolling window is five hours, like Claude's and Codex's sessions. */
export function snapshotFromGoUsage(data: OpenCodeGoUsageResponse): UsageSnapshot {
  const windows = [
    goWindow("Session", data.usage?.rolling),
    goWindow("Weekly", data.usage?.weekly),
    goWindow("Monthly", data.usage?.monthly),
  ].filter((window): window is UsageWindow => window !== undefined);
  if (windows.length === 0) windows.push({ label: "Usage", detail: "No quota data reported" });
  return { planLabel: "Go", windows, fetchedAt: Date.now() };
}

/** Native mode: the key `opencode auth login` stored for OpenCode Go. */
async function localApiKey(): Promise<string> {
  let raw: string;
  try {
    raw = await readHomeFile(OPENCODE_AUTH_PATH);
  } catch {
    throw new Error("OpenCode login not found. Run `opencode auth login`, or paste an API key.");
  }
  return openCodeApiKey(raw, `~/${OPENCODE_AUTH_PATH}`);
}

export async function fetchOpenCodeUsage(account: Account): Promise<UsageSnapshot> {
  const pasted = authCredential(account.auth).trim();
  const apiKey = pasted ? openCodeApiKey(pasted, "Pasted credential") : await localApiKey();

  let data: OpenCodeGoUsageResponse;
  try {
    data = await fetchJson<OpenCodeGoUsageResponse>(USAGE_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch (e) {
    if (e instanceof HttpError) {
      // A valid Zen key can exist without a Go subscription.
      if (e.status === 403) throw new Error("This OpenCode key has no OpenCode Go subscription.");
      if (e.status === 401) {
        throw new Error(
          pasted
            ? "OpenCode rejected this API key — paste a fresh one."
            : "OpenCode rejected the local key — run `opencode auth login`, then retry.",
        );
      }
    }
    throw e;
  }
  return snapshotFromGoUsage(data);
}
