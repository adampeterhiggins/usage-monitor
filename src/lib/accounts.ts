import { LazyStore } from "@tauri-apps/plugin-store";
import type { Account, AccountPublic, ProviderId } from "./usage-types";
import { toPublic } from "./usage-types";
import { invalidate } from "./usage/cache";

const store = new LazyStore("accounts.json");
const ACCOUNTS_KEY = "accounts";
const PROVIDERS = new Set<ProviderId>(["claude", "codex", "cursor"]);

function normalize(value: unknown): Account[] {
  if (!Array.isArray(value)) return [];
  const out: Account[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const a = raw as Record<string, unknown>;
    if (typeof a.id !== "string" || typeof a.label !== "string") continue;
    if (typeof a.provider !== "string" || !PROVIDERS.has(a.provider as ProviderId)) continue;
    out.push({
      id: a.id,
      provider: a.provider as ProviderId,
      label: a.label,
      credential: typeof a.credential === "string" ? a.credential : "",
      extra: typeof a.extra === "string" && a.extra ? a.extra : undefined,
      hidden: a.hidden === true,
    });
  }
  return out;
}

async function load(): Promise<Account[]> {
  return normalize(await store.get(ACCOUNTS_KEY));
}

async function persist(accounts: Account[]): Promise<void> {
  await store.set(ACCOUNTS_KEY, accounts);
  await store.save();
}

export async function listAccounts(): Promise<AccountPublic[]> {
  return (await load()).map(toPublic);
}

export async function getAccount(id: string): Promise<Account | undefined> {
  return (await load()).find((a) => a.id === id);
}

export async function getAccountSecret(id: string): Promise<{ credential: string; extra?: string }> {
  const account = await getAccount(id);
  if (!account) throw new Error("Account not found.");
  return { credential: account.credential, extra: account.extra };
}

export async function addAccount(input: {
  provider: ProviderId;
  label: string;
  credential: string;
  extra?: string;
}): Promise<AccountPublic> {
  const accounts = await load();
  const account: Account = {
    id: crypto.randomUUID(),
    provider: input.provider,
    label: input.label.trim(),
    credential: input.credential,
    extra: input.extra?.trim() || undefined,
    hidden: false,
  };
  accounts.push(account);
  await persist(accounts);
  return toPublic(account);
}

export async function updateAccount(input: {
  id: string;
  provider: ProviderId;
  label: string;
  credential: string;
  extra?: string;
}): Promise<AccountPublic> {
  const accounts = await load();
  const idx = accounts.findIndex((a) => a.id === input.id);
  if (idx < 0) throw new Error("Account not found.");
  accounts[idx] = {
    id: input.id,
    provider: input.provider,
    label: input.label.trim(),
    credential: input.credential,
    extra: input.extra?.trim() || undefined,
    hidden: accounts[idx].hidden,
  };
  await persist(accounts);
  invalidate(input.id);
  return toPublic(accounts[idx]);
}

export async function setAccountHidden(id: string, hidden: boolean): Promise<AccountPublic> {
  const accounts = await load();
  const idx = accounts.findIndex((a) => a.id === id);
  if (idx < 0) throw new Error("Account not found.");
  accounts[idx] = { ...accounts[idx], hidden };
  await persist(accounts);
  return toPublic(accounts[idx]);
}

export async function removeAccount(id: string): Promise<void> {
  const accounts = await load();
  const next = accounts.filter((a) => a.id !== id);
  if (next.length === accounts.length) return;
  await persist(next);
  invalidate(id);
}

export async function fetchAccountUsage(id: string, force = false) {
  const { fetchUsage } = await import("./usage/cache");
  const account = await getAccount(id);
  if (!account) throw new Error("Account not found.");
  return fetchUsage(account, { force });
}
