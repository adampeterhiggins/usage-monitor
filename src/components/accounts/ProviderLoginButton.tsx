import * as React from "react";
import { openExternal } from "../../platform/external";
import {
  cancelProviderLogin,
  credentialLooksLikeSession,
  describeLoginError,
  isAbortError,
  peekProviderLogin,
  providerLoginMethods,
  signInLabel,
  startProviderLogin,
  submitLoginCode,
  type ProviderLoginResult,
  type ProviderLoginSession,
} from "../../providers/shared/providerLogin";
import { toast } from "../ui/toast";
import { PROVIDERS } from "../../providers/metadata";
import type { ProviderId } from "../../contracts/providers";
import { Button } from "../ui/button";

const PROVIDER_FILL_STYLE = {
  orange: {
    background: "var(--ui-canvas-provider-orange-background)",
    color: "var(--ui-canvas-provider-orange-foreground)",
  },
  green: {
    background: "var(--ui-canvas-provider-green-background)",
    color: "var(--ui-canvas-provider-green-foreground)",
  },
  blue: {
    background: "var(--ui-canvas-provider-blue-background)",
    color: "var(--ui-canvas-provider-blue-foreground)",
  },
  purple: {
    background: "var(--ui-canvas-provider-purple-background)",
    color: "var(--ui-canvas-provider-purple-foreground)",
  },
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
  methodId,
  credential,
  disabled,
  onSignedIn,
  onClear,
}: {
  provider: ProviderId;
  /** Which managed flow to start — chosen by the dialog's method select. */
  methodId?: string;
  credential: string;
  disabled?: boolean;
  onSignedIn: (result: { credential: string; accountId?: string; suggestedLabel?: string }) => void;
  onClear?: () => void;
}) {
  const [session, setSession] = React.useState<ProviderLoginSession | null>(() => peekProviderLogin(provider));
  const methods = providerLoginMethods(provider);
  const method = methods.find((candidate) => candidate.id === methodId) ?? methods[0];
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
      bindSession(await startProviderLogin(provider, method.id));
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
      submitLoginCode(session, pasteCode);
    } catch (error) {
      setSubmittingCode(false);
      toast.error(describeLoginError(error, "Couldn’t submit that code."));
    }
  }

  if (pending && session.kind === "device_code") {
    return (
      <div className="rounded-lg bg-ui-control px-3 py-2.5">
        <div className="text-[12px] text-ui-secondary">Enter this code in the browser that opened:</div>
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
      <div className="rounded-lg bg-ui-control px-3 py-2.5">
        <div className="text-[12px] text-ui-secondary">{session.prompt}</div>
        <input
          value={pasteCode}
          onChange={(event) => setPasteCode(event.target.value)}
          placeholder="Paste the code or address here"
          className="mt-2 h-8 w-full rounded-lg border border-ui-input-border bg-ui-input px-2 text-[12px] text-ui-input-fg"
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
      <div className="rounded-lg bg-ui-control px-3 py-2.5">
        <div className="text-[12px] text-ui-secondary">{session.prompt}</div>
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
      <div className="flex items-center justify-between gap-2 rounded-xl bg-ui-control px-3 py-2">
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
    <div className="flex flex-col gap-1.5">
      <Button
        variant="accent"
        disabled={disabled}
        onClick={() => void handleSignIn()}
        className="w-full"
        style={PROVIDER_FILL_STYLE[PROVIDERS[provider].tone]}
      >
        {methods.length > 1 ? method.label : signInLabel(provider)}
      </Button>
      {methods.length > 1 && method.description ? (
        <p className="text-[11px] leading-[14px] text-ui-tertiary">{method.description}</p>
      ) : null}
    </div>
  );
}
