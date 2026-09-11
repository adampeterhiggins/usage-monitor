import * as React from "react";
import { openExternal } from "../../lib/platform/external";
import {
  cancelProviderLogin,
  credentialLooksLikeSession,
  describeLoginError,
  isAbortError,
  peekProviderLogin,
  signInLabel,
  startProviderLogin,
  submitClaudeLoginCode,
  type ProviderLoginResult,
  type ProviderLoginSession,
} from "../../lib/auth/provider-login";
import { toast } from "../../lib/platform/toast";
import { PROVIDERS } from "../../lib/auth/provider-meta";
import type { ProviderId } from "../../lib/contracts/providers";
import { Button, cn } from "../ui";

const ACCENT_CLASS = {
  orange: "bg-support-orange",
  green: "bg-support-green",
  blue: "bg-support-blue",
} as const;

const attachedDone = new WeakSet<ProviderLoginSession>();
const latestDoneHandlers = new WeakMap<
  ProviderLoginSession,
  {
    onSuccess: (result: ProviderLoginResult) => void;
    onError: (error: unknown) => void;
    onFinally: () => void;
  }
>();

function attachDone(
  session: ProviderLoginSession,
  handlers: {
    onSuccess: (result: ProviderLoginResult) => void;
    onError: (error: unknown) => void;
    onFinally: () => void;
  },
): void {
  latestDoneHandlers.set(session, handlers);
  if (attachedDone.has(session)) return;
  attachedDone.add(session);
  void session.done
    .then(
      (result) => latestDoneHandlers.get(session)?.onSuccess(result),
      (error) => latestDoneHandlers.get(session)?.onError(error),
    )
    .finally(() => latestDoneHandlers.get(session)?.onFinally());
}

export function ProviderLoginButton({
  provider,
  credential,
  disabled,
  onSignedIn,
  onClear,
}: {
  provider: ProviderId;
  credential: string;
  disabled?: boolean;
  onSignedIn: (result: { credential: string; accountId?: string; suggestedLabel?: string }) => void;
  onClear?: () => void;
}) {
  const [session, setSession] = React.useState<ProviderLoginSession | null>(() => peekProviderLogin(provider));
  const [pasteCode, setPasteCode] = React.useState("");
  const [submittingCode, setSubmittingCode] = React.useState(false);
  const sessionRef = React.useRef<ProviderLoginSession | null>(session);
  const startingRef = React.useRef(false);
  const onSignedInRef = React.useRef(onSignedIn);
  onSignedInRef.current = onSignedIn;
  const providerRef = React.useRef(provider);

  function bindSession(next: ProviderLoginSession): void {
    sessionRef.current = next;
    setSession(next);
    attachDone(next, {
      onSuccess: (result) => {
        onSignedInRef.current(result);
        toast.success(
          result.suggestedLabel
            ? `Signed in as ${result.suggestedLabel}`
            : `Signed in with ${PROVIDERS[provider].name}`,
        );
      },
      onError: (error) => {
        if (!isAbortError(error)) {
          toast.error(describeLoginError(error, "Sign-in failed."));
        }
      },
      onFinally: () => {
        if (sessionRef.current === next) {
          sessionRef.current = null;
          setSession(null);
          setPasteCode("");
          setSubmittingCode(false);
        }
      },
    });
  }

  React.useEffect(() => {
    if (providerRef.current !== provider) {
      cancelProviderLogin(providerRef.current);
      sessionRef.current = null;
      setSession(null);
      setPasteCode("");
      setSubmittingCode(false);
      providerRef.current = provider;
    }
    const existing = peekProviderLogin(provider);
    if (existing) bindSession(existing);
  }, [provider]);

  const pending = session !== null;
  const signedIn = credentialLooksLikeSession(provider, credential);
  const hasCredential = credential.trim().length > 0;

  async function handleSignIn() {
    if (pending || startingRef.current || disabled) return;
    startingRef.current = true;
    try {
      bindSession(await startProviderLogin(provider));
    } catch (error) {
      if (!isAbortError(error)) {
        toast.error(describeLoginError(error, "Sign-in failed."));
      }
    } finally {
      startingRef.current = false;
    }
  }

  function handleCancel() {
    cancelProviderLogin(provider);
    sessionRef.current = null;
    setSession(null);
    setPasteCode("");
    setSubmittingCode(false);
  }

  async function handleCopyCode() {
    if (!session?.userCode) return;
    try {
      await navigator.clipboard.writeText(session.userCode);
      toast.success("Code copied");
    } catch {
      toast.error("Couldn’t copy the code");
    }
  }

  function handleSubmitPasteCode() {
    if (!session || submittingCode) return;
    try {
      setSubmittingCode(true);
      submitClaudeLoginCode(session, pasteCode);
    } catch (error) {
      setSubmittingCode(false);
      toast.error(describeLoginError(error, "Couldn’t submit that code."));
    }
  }

  if (pending && session.kind === "device_code") {
    return (
      <div className="rounded-lg bg-control-subtle px-3 py-2.5">
        <div className="text-[12px] text-secondary">Enter this code in the browser that opened:</div>
        <div className="mt-1 font-mono text-[15px] tracking-wide">{session.userCode}</div>
        <div className="mt-2 flex gap-2">
          <Button size="small" variant="glass" onClick={() => void handleCopyCode()}>
            Copy
          </Button>
          <Button size="small" variant="glass" onClick={handleCancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (pending && session.kind === "paste_code") {
    return (
      <div className="rounded-lg bg-control-subtle px-3 py-2.5">
        <div className="text-[12px] text-secondary">{session.prompt}</div>
        <input
          value={pasteCode}
          onChange={(event) => setPasteCode(event.target.value)}
          placeholder="Paste the full code (abc#xyz)"
          className="mt-2 h-8 w-full rounded-lg border border-separator bg-surface px-2 text-[12px]"
          autoComplete="off"
          spellCheck={false}
        />
        <div className="mt-2 flex gap-2">
          <Button
            size="small"
            variant="accent"
            disabled={!pasteCode.trim() || submittingCode}
            onClick={handleSubmitPasteCode}
          >
            {submittingCode ? "Signing in…" : "Continue"}
          </Button>
          <Button size="small" variant="glass" onClick={handleCancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (pending && session.kind === "browser") {
    return (
      <div className="rounded-lg bg-control-subtle px-3 py-2.5">
        <div className="text-[12px] text-secondary">{session.prompt}</div>
        <div className="mt-2 flex gap-2">
          {session.verificationUri ? (
            <Button size="small" variant="glass" onClick={() => void openExternal(session.verificationUri!)}>
              Open browser again
            </Button>
          ) : null}
          <Button size="small" variant="glass" onClick={handleCancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (signedIn || hasCredential) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl bg-control-subtle px-3 py-2">
        <div className="min-w-0 text-[12px]">
          {signedIn ? `Signed in with ${PROVIDERS[provider].name}` : "Using a pasted credential"}
        </div>
        <div className="flex shrink-0 gap-1.5">
          {onClear ? (
            <Button size="small" variant="glass" disabled={disabled} onClick={onClear}>
              Clear
            </Button>
          ) : null}
          <Button size="small" variant="glass" disabled={disabled} onClick={() => void handleSignIn()}>
            {signedIn ? "Sign in again" : signInLabel(provider)}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Button
      variant="accent"
      disabled={disabled}
      onClick={() => void handleSignIn()}
      className={cn("w-full", ACCENT_CLASS[PROVIDERS[provider].accent])}
    >
      {signInLabel(provider)}
    </Button>
  );
}
