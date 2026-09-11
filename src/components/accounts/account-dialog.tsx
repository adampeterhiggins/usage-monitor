import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { getAccountSecret, useAccountsStore } from "../../lib/accounts";
import {
  CURSOR_IDE_PIN,
  cursorIdeLoginMeta,
  describeKeychainEntry,
  KEYCHAIN_LOGINS,
  listKeychainAccounts,
  type CursorIdeLogin,
  type KeychainEntry,
} from "../../lib/auth/keychain";
import { credentialLooksLikeSession, signInLabel } from "../../lib/auth/provider-login";
import { toast } from "../../lib/platform/toast";
import { PROVIDER_ORDER, PROVIDERS, type AccountPublic, type ProviderId } from "../../lib/usage/types";
import { ProviderLoginButton } from "./provider-login-button";
import { Button, Input, cn } from "../ui";

type AuthMethod = "signin" | "local" | "paste";

const SELECT_CLASS =
  "h-8 rounded-lg border border-separator bg-surface px-2 text-[13px] outline-none focus:ring-2 focus:ring-support-blue/30";

interface AccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account?: AccountPublic | null;
}

function inferAuthMethod(provider: ProviderId, credential: string): AuthMethod {
  const cred = credential.trim();
  if (!cred && KEYCHAIN_LOGINS[provider]) return "local";
  if (cred && credentialLooksLikeSession(provider, cred)) return "signin";
  if (cred) return "paste";
  return "signin";
}

export function AccountDialog({ open, onOpenChange, account }: AccountDialogProps) {
  const editing = !!account;
  const [provider, setProvider] = React.useState<ProviderId>("claude");
  const [label, setLabel] = React.useState("");
  const [credential, setCredential] = React.useState("");
  /** Provider-specific secondary value carried through untouched (e.g. Codex account id). */
  const [savedExtra, setSavedExtra] = React.useState<string | undefined>(undefined);
  /** Native mode: which local login to read ("" = automatic). */
  const [keychainAccount, setKeychainAccount] = React.useState("");
  const [keychainEntries, setKeychainEntries] = React.useState<KeychainEntry[]>([]);
  const [cursorIde, setCursorIde] = React.useState<CursorIdeLogin | null>(null);
  const [loadingSecret, setLoadingSecret] = React.useState(false);
  const [authMethod, setAuthMethod] = React.useState<AuthMethod>("signin");
  const [error, setError] = React.useState<string | null>(null);

  const meta = PROVIDERS[provider];
  const keychainLogin = KEYCHAIN_LOGINS[provider];

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
          // In native mode `extra` is the pinned local login (Keychain account
          // or Cursor `ide`); otherwise it is provider data to carry through.
          if (KEYCHAIN_LOGINS[account.provider] && secret.credential.trim() === "") {
            setKeychainAccount(secret.extra ?? "");
            setSavedExtra(undefined);
          } else {
            setSavedExtra(secret.extra);
          }
          setAuthMethod(inferAuthMethod(account.provider, secret.credential));
        })
        .catch((e) => setError(e instanceof Error ? e.message : String(e)))
        .finally(() => setLoadingSecret(false));
    } else {
      setProvider("claude");
      setLabel("");
      setCredential("");
      setSavedExtra(undefined);
      setKeychainAccount("");
      setAuthMethod("signin");
      setLoadingSecret(false);
    }
  }, [open, account]);

  // Native mode reads a local login. List Keychain entries (and the Cursor IDE
  // session) so the user can pin one when several exist.
  React.useEffect(() => {
    if (!open || !keychainLogin) {
      setKeychainEntries([]);
      setCursorIde(null);
      return;
    }
    let cancelled = false;
    void listKeychainAccounts(keychainLogin.service)
      .then((entries) => {
        if (!cancelled) setKeychainEntries(entries);
      })
      .catch(() => {
        if (!cancelled) setKeychainEntries([]);
      });
    if (provider === "cursor") {
      void cursorIdeLoginMeta()
        .then((login) => {
          if (!cancelled) setCursorIde(login);
        })
        .catch(() => {
          if (!cancelled) setCursorIde(null);
        });
    } else {
      setCursorIde(null);
    }
    return () => {
      cancelled = true;
    };
  }, [open, keychainLogin, provider]);

  const nativeOptions: Array<{ id: string; label: string }> = [];
  if (provider === "cursor" && cursorIde) {
    nativeOptions.push({
      id: CURSOR_IDE_PIN,
      label: cursorIde.email ? `Cursor IDE · ${cursorIde.email}` : "Cursor IDE login",
    });
  }
  for (const entry of keychainEntries) {
    nativeOptions.push({
      id: entry.account,
      label: provider === "cursor" ? `cursor-agent · ${describeKeychainEntry(entry)}` : describeKeychainEntry(entry),
    });
  }

  const pinnedMissing = keychainAccount !== "" && !nativeOptions.some((o) => o.id === keychainAccount);
  const showKeychainPicker = nativeOptions.length > 1 || keychainAccount !== "";

  function applyAuthMethod(next: AuthMethod) {
    if (next === authMethod) return;
    if (next === "local") {
      setCredential("");
    } else if (next === "signin") {
      if (!credentialLooksLikeSession(provider, credential)) setCredential("");
      setKeychainAccount("");
    } else {
      if (credentialLooksLikeSession(provider, credential)) setCredential("");
      setKeychainAccount("");
    }
    setAuthMethod(next);
  }

  function nextExtra(): string | undefined {
    if (authMethod === "local") return keychainAccount || undefined;
    return savedExtra;
  }

  const canSubmit =
    label.trim().length > 0 &&
    !loadingSecret &&
    (authMethod === "local" || credential.trim().length > 0);

  async function handleConfirm() {
    setError(null);
    try {
      const nextCredential = authMethod === "local" ? "" : credential.trim();
      const accounts = useAccountsStore.getState();
      if (editing && account) {
        await accounts.update({
          id: account.id,
          provider,
          label: label.trim(),
          credential: nextCredential,
          extra: nextExtra(),
        });
        toast.success("Account updated", { description: `${meta.name} · ${label.trim()}` });
      } else {
        await accounts.add({
          provider,
          label: label.trim(),
          credential: nextCredential,
          extra: nextExtra(),
        });
        toast.success("Account added", { description: `${meta.name} · ${label.trim()}` });
      }
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
        <Dialog.Overlay className="fixed inset-0 z-[60] rounded-[16px] bg-black/25" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[70] max-h-[calc(100vh-2rem)] w-[min(420px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-menu p-5 shadow-xl ring-1 ring-black/10">
          <Dialog.Title className="text-[16px] font-semibold">
            {editing ? "Edit Account" : "Add Account"}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-[12px] leading-[16px] text-secondary">
            Credentials stay on this Mac.
          </Dialog.Description>

          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-secondary">Provider</span>
                <div
                  className={cn(
                    "grid grid-cols-3 rounded-lg bg-control-subtle p-0.5",
                    editing && "opacity-60",
                  )}
                >
                  {PROVIDER_ORDER.map((id) => (
                    <button
                      key={id}
                      type="button"
                      disabled={editing}
                      onClick={() => {
                        if (editing || id === provider) return;
                        setProvider(id);
                        setCredential("");
                        setSavedExtra(undefined);
                        setKeychainAccount("");
                        if (authMethod === "local" && !KEYCHAIN_LOGINS[id]) setAuthMethod("signin");
                      }}
                      className={cn(
                        "h-7 rounded-md text-[12px] font-medium transition-colors",
                        provider === id ? "bg-surface text-ink shadow-sm" : "text-secondary hover:text-ink",
                      )}
                    >
                      {PROVIDERS[id].name}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-secondary">Label</span>
                <Input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Personal or Work"
                  autoFocus={!editing}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-secondary">Sign-in method</span>
                <select
                  value={authMethod}
                  onChange={(e) => applyAuthMethod(e.target.value as AuthMethod)}
                  className={SELECT_CLASS}
                >
                  <option value="signin">{signInLabel(provider)}</option>
                  {keychainLogin ? (
                    <option value="local">Use {meta.nativeLoginName} on this Mac</option>
                  ) : null}
                  <option value="paste">{meta.pasteMethodLabel}</option>
                </select>
              </label>
            </div>

            {authMethod === "signin" ? (
              <ProviderLoginButton
                provider={provider}
                credential={credential}
                disabled={loadingSecret}
                onSignedIn={(result) => {
                  setCredential(result.credential);
                  setKeychainAccount("");
                  if (result.extra) setSavedExtra(result.extra);
                  if (!label.trim() && result.suggestedLabel) setLabel(result.suggestedLabel);
                }}
                onClear={() => {
                  setCredential("");
                  setSavedExtra(undefined);
                }}
              />
            ) : null}

            {authMethod === "local" && keychainLogin ? (
              <div className="flex flex-col gap-1.5">
                {showKeychainPicker ? (
                  <>
                    <span className="text-[11px] text-tertiary">
                      {nativeOptions.length} local logins found. Pin one if Automatic picks the wrong account.
                    </span>
                    <select
                      value={keychainAccount}
                      onChange={(e) => setKeychainAccount(e.target.value)}
                      className={SELECT_CLASS}
                      aria-label={provider === "cursor" ? "Local login" : keychainLogin.noun}
                    >
                      <option value="">
                        {provider === "cursor"
                          ? "Automatic — Cursor app, else cursor-agent"
                          : "Automatic — newest local login"}
                      </option>
                      {nativeOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                      {pinnedMissing ? (
                        <option value={keychainAccount}>
                          {keychainAccount === CURSOR_IDE_PIN
                            ? "Cursor IDE (no longer signed in)"
                            : `${keychainAccount} (no longer in Keychain)`}
                        </option>
                      ) : null}
                    </select>
                  </>
                ) : (
                  <p className="text-[12px] leading-[16px] text-secondary">
                    Uses the {meta.nativeLoginName} login already on this Mac.
                  </p>
                )}
              </div>
            ) : null}

            {authMethod === "paste" ? (
              <Input
                type="password"
                value={credential}
                onChange={(e) => setCredential(e.target.value)}
                placeholder={loadingSecret ? "Loading…" : meta.credentialPlaceholder}
                disabled={loadingSecret}
                autoComplete="off"
                spellCheck={false}
              />
            ) : null}

            {error ? <span className="text-[11px] text-support-red">{error}</span> : null}
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
