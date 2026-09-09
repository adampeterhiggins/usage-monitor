import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { addAccount, getAccountSecret, updateAccount } from "../lib/accounts";
import {
  CLAUDE_CODE_KEYCHAIN_SERVICE,
  describeKeychainEntry,
  listKeychainAccounts,
  type KeychainEntry,
} from "../lib/keychain";
import { toast } from "../lib/toast";
import { PROVIDER_ORDER, PROVIDERS, type AccountPublic, type ProviderId } from "../lib/usage-types";
import { Button, Input } from "./ui";

interface AccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account?: AccountPublic | null;
  onSaved: () => void;
}

export function AccountDialog({ open, onOpenChange, account, onSaved }: AccountDialogProps) {
  const editing = !!account;
  const [provider, setProvider] = React.useState<ProviderId>("claude");
  const [label, setLabel] = React.useState("");
  const [credential, setCredential] = React.useState("");
  /** Provider-specific secondary value carried through untouched (e.g. Codex account id). */
  const [savedExtra, setSavedExtra] = React.useState<string | undefined>(undefined);
  /** Claude only: which Keychain login to read ("" = automatic). */
  const [keychainAccount, setKeychainAccount] = React.useState("");
  const [keychainEntries, setKeychainEntries] = React.useState<KeychainEntry[]>([]);
  const [loadingSecret, setLoadingSecret] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const meta = PROVIDERS[provider];

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    if (account) {
      setProvider(account.provider);
      setLabel(account.label);
      setCredential("");
      setSavedExtra(undefined);
      setKeychainAccount("");
      setLoadingSecret(true);
      void getAccountSecret(account.id)
        .then((secret) => {
          setCredential(secret.credential);
          setSavedExtra(secret.extra);
          if (account.provider === "claude") setKeychainAccount(secret.extra ?? "");
        })
        .catch((e) => setError(e instanceof Error ? e.message : String(e)))
        .finally(() => setLoadingSecret(false));
    } else {
      setProvider("claude");
      setLabel("");
      setCredential("");
      setSavedExtra(undefined);
      setKeychainAccount("");
      setLoadingSecret(false);
    }
  }, [open, account]);

  // Claude with no session key reads the Claude Code login from the Keychain.
  // List the entries so the user can pin one when several share the service.
  React.useEffect(() => {
    if (!open || provider !== "claude") {
      setKeychainEntries([]);
      return;
    }
    let cancelled = false;
    void listKeychainAccounts(CLAUDE_CODE_KEYCHAIN_SERVICE)
      .then((entries) => {
        if (!cancelled) setKeychainEntries(entries);
      })
      .catch(() => {
        if (!cancelled) setKeychainEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, provider]);

  const usesKeychain = provider === "claude" && credential.trim() === "";
  const pinnedMissing =
    keychainAccount !== "" && !keychainEntries.some((e) => e.account === keychainAccount);
  const showKeychainPicker = usesKeychain && (keychainEntries.length > 1 || keychainAccount !== "");

  /** What to persist in `extra` for this provider. */
  function nextExtra(): string | undefined {
    if (provider !== "claude") return savedExtra;
    return usesKeychain && keychainAccount ? keychainAccount : undefined;
  }

  const canSubmit =
    label.trim().length > 0 && !loadingSecret && (meta.credentialOptional || credential.trim().length > 0);

  async function handleConfirm() {
    setError(null);
    try {
      if (editing && account) {
        await updateAccount({
          id: account.id,
          provider,
          label: label.trim(),
          credential: credential.trim(),
          extra: nextExtra(),
        });
        toast.success("Account updated", { description: `${meta.name} · ${label.trim()}` });
      } else {
        await addAccount({
          provider,
          label: label.trim(),
          credential: credential.trim(),
          extra: nextExtra(),
        });
        toast.success("Account added", { description: `${meta.name} · ${label.trim()}` });
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      toast.error(editing ? "Couldn’t update account" : "Couldn’t add account", { description: message });
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/25" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(420px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-menu p-5 shadow-xl ring-1 ring-black/10">
          <Dialog.Title className="text-[16px] font-semibold">
            {editing ? "Edit Account" : "Add Account"}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-[12px] text-secondary">
            Monitor usage for Claude, Codex, or Cursor. Credentials stay on this Mac.
          </Dialog.Description>

          <div className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-secondary">Provider</span>
              <select
                value={provider}
                disabled={editing}
                onChange={(e) => setProvider(e.target.value as ProviderId)}
                className="h-8 rounded-lg border border-separator bg-surface px-2 text-[13px]"
              >
                {PROVIDER_ORDER.map((id) => (
                  <option key={id} value={id}>
                    {PROVIDERS[id].name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-secondary">Label</span>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Personal"
                autoFocus={!editing}
              />
              <span className="text-[11px] text-quaternary">e.g. “Personal” or “Work”</span>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-secondary">{meta.credentialTitle}</span>
              <Input
                type="password"
                value={credential}
                onChange={(e) => setCredential(e.target.value)}
                placeholder={loadingSecret ? "Loading…" : meta.credentialPlaceholder}
                disabled={loadingSecret}
                autoComplete="off"
                spellCheck={false}
              />
              <span className="text-[11px] text-quaternary">{meta.credentialHelp}</span>
              {error ? <span className="text-[11px] text-support-red">{error}</span> : null}
            </label>

            {showKeychainPicker ? (
              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-medium text-secondary">Claude Code login</span>
                <select
                  value={keychainAccount}
                  onChange={(e) => setKeychainAccount(e.target.value)}
                  className="h-8 rounded-lg border border-separator bg-surface px-2 text-[13px]"
                >
                  <option value="">Automatic — newest login with a valid token</option>
                  {keychainEntries.map((entry) => (
                    <option key={entry.account} value={entry.account}>
                      {describeKeychainEntry(entry)}
                    </option>
                  ))}
                  {pinnedMissing ? (
                    <option value={keychainAccount}>{keychainAccount} (no longer in Keychain)</option>
                  ) : null}
                </select>
                <span className="text-[11px] text-quaternary">
                  {keychainEntries.length === 1
                    ? "One entry uses"
                    : `${keychainEntries.length} entries share`}{" "}
                  the “{CLAUDE_CODE_KEYCHAIN_SERVICE}” Keychain service. Pin one if Automatic picks the
                  wrong login.
                </span>
              </label>
            ) : null}
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="glass">Cancel</Button>
            </Dialog.Close>
            <Button variant="accent" disabled={!canSubmit} onClick={() => void handleConfirm()}>
              {editing ? "Save" : "Add"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
