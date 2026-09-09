import * as React from "react";
import {
  credentialLooksLikeSession,
  describeLoginError,
  isAbortError,
  signInLabel,
  startProviderLogin,
  submitClaudeLoginCode,
  type ProviderLoginSession,
} from "../lib/provider-login";
import { toast } from "../lib/toast";
import { PROVIDERS, type ProviderId } from "../lib/usage-types";
import { Button } from "./ui";

export function ProviderLoginButton({
  provider,
  credential,
  disabled,
  onSignedIn,
}: {
  provider: ProviderId;
  credential: string;
  disabled?: boolean;
  onSignedIn: (result: { credential: string; extra?: string; suggestedLabel?: string }) => void;
}) {
  const [session, setSession] = React.useState<ProviderLoginSession | null>(null);
  const [pasteCode, setPasteCode] = React.useState("");
  const sessionRef = React.useRef<ProviderLoginSession | null>(null);

  React.useEffect(() => {
    return () => {
      sessionRef.current?.cancel();
      sessionRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    sessionRef.current?.cancel();
    sessionRef.current = null;
    setSession(null);
    setPasteCode("");
  }, [provider]);

  const pending = session !== null;
  const signedIn = credentialLooksLikeSession(provider, credential);

  async function handleSignIn() {
    if (pending || disabled) return;
    try {
      const next = await startProviderLogin(provider);
      sessionRef.current = next;
      setSession(next);
      const result = await next.done;
      onSignedIn(result);
      toast.success(result.suggestedLabel ? `Signed in as ${result.suggestedLabel}` : `Signed in with ${PROVIDERS[provider].name}`);
    } catch (error) {
      if (!isAbortError(error)) {
        toast.error(describeLoginError(error, "Sign-in failed."));
      }
    } finally {
      sessionRef.current = null;
      setSession(null);
      setPasteCode("");
    }
  }

  function handleCancel() {
    sessionRef.current?.cancel();
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
    if (!session) return;
    try {
      submitClaudeLoginCode(session, pasteCode);
    } catch (error) {
      toast.error(describeLoginError(error, "Couldn’t submit that code."));
    }
  }

  if (pending && session.kind === "device_code") {
    return (
      <div className="rounded-lg bg-control-subtle px-2.5 py-2">
        <div className="text-[11px] text-secondary">Enter this code in the browser that opened:</div>
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
      <div className="rounded-lg bg-control-subtle px-2.5 py-2">
        <div className="text-[11px] text-secondary">{session.prompt}</div>
        <input
          value={pasteCode}
          onChange={(event) => setPasteCode(event.target.value)}
          placeholder="Paste the authorization code"
          className="mt-2 h-8 w-full rounded-lg border border-separator bg-surface px-2 text-[12px]"
          autoComplete="off"
          spellCheck={false}
        />
        <div className="mt-2 flex gap-2">
          <Button size="small" variant="accent" disabled={!pasteCode.trim()} onClick={handleSubmitPasteCode}>
            Continue
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
      <div className="rounded-lg bg-control-subtle px-2.5 py-2">
        <div className="text-[11px] text-secondary">{session.prompt}</div>
        <div className="mt-2">
          <Button size="small" variant="glass" onClick={handleCancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="text-[11px] text-tertiary">
        {signedIn ? "This account has its own login session." : "Optional — creates a login just for this account."}
      </div>
      <Button size="small" variant={signedIn ? "glass" : "accent"} disabled={disabled} onClick={() => void handleSignIn()}>
        {signedIn ? "Sign in again" : signInLabel(provider)}
      </Button>
    </div>
  );
}
