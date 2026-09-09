import * as React from "react";
import { ChevronDown } from "lucide-react";
import {
  describeGithubOAuthError,
  GITHUB_OAUTH_CLIENT_ID,
  resolveGithubOAuthClientId,
  startGithubDeviceFlow,
  type GithubDeviceFlowSession,
} from "../lib/github-oauth";
import {
  clearGithubCredentials,
  getGithubAuth,
  getGithubOAuthClientId,
  importTokenFromGhCli,
  saveGithubCredentials,
  setGithubOAuthClientId,
  type GithubAuth,
} from "../lib/settings";
import { toast } from "../lib/toast";
import { Button, cn } from "./ui";

export function GithubAuthSettings({
  githubToken,
  onGithubTokenChange,
}: {
  githubToken: string | null;
  onGithubTokenChange: (token: string | null) => void;
}) {
  const [auth, setAuth] = React.useState<GithubAuth | null>(null);
  const [tokenDraft, setTokenDraft] = React.useState("");
  const [clientIdDraft, setClientIdDraft] = React.useState("");
  const [storedClientId, setStoredClientId] = React.useState<string | null>(null);
  const [tokenOpen, setTokenOpen] = React.useState(false);
  const [userCode, setUserCode] = React.useState<string | null>(null);
  const sessionRef = React.useRef<GithubDeviceFlowSession | null>(null);
  const needsClientId = !GITHUB_OAUTH_CLIENT_ID.trim();

  React.useEffect(() => {
    void getGithubAuth().then(setAuth);
    if (needsClientId) {
      void getGithubOAuthClientId().then((id) => {
        setStoredClientId(id);
        setClientIdDraft(id ?? "");
      });
    }
  }, [githubToken, needsClientId]);

  React.useEffect(() => {
    if (auth?.source === "oauth") {
      setTokenDraft("");
      return;
    }
    setTokenDraft(githubToken ?? "");
  }, [auth?.source, githubToken]);

  React.useEffect(() => {
    return () => {
      sessionRef.current?.cancel();
      sessionRef.current = null;
    };
  }, []);

  const pending = userCode !== null;
  const signedIn = !!githubToken;

  async function persist(token: string, next: GithubAuth) {
    await saveGithubCredentials(token, next);
    setAuth(next);
    onGithubTokenChange(token);
  }

  async function handleSignIn() {
    if (pending) return;
    try {
      const clientId = resolveGithubOAuthClientId(clientIdDraft || storedClientId);
      if (needsClientId && clientId && clientId !== storedClientId) {
        await setGithubOAuthClientId(clientId);
        setStoredClientId(clientId);
      }
      const session = await startGithubDeviceFlow(clientId);
      sessionRef.current = session;
      setUserCode(session.userCode);
      const result = await session.done;
      await persist(result.token, { source: "oauth", login: result.login });
      setTokenOpen(false);
      toast.success(result.login ? `Signed in as @${result.login}` : "Signed in with GitHub");
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        toast.error(describeGithubOAuthError(error));
      }
    } finally {
      sessionRef.current = null;
      setUserCode(null);
    }
  }

  function handleCancel() {
    sessionRef.current?.cancel();
  }

  async function handleSignOut() {
    sessionRef.current?.cancel();
    await clearGithubCredentials();
    setAuth(null);
    setTokenDraft("");
    setTokenOpen(false);
    onGithubTokenChange(null);
    toast.success("Signed out of GitHub");
  }

  async function handleImportGh() {
    const token = await importTokenFromGhCli();
    if (!token) {
      toast.error("Couldn’t import from gh CLI");
      return;
    }
    await persist(token, { source: "gh" });
    setTokenDraft(token);
    toast.success("Imported GitHub token from gh");
  }

  async function handleSavePat() {
    const token = tokenDraft.trim();
    if (!token) return;
    await persist(token, { source: "pat" });
    toast.success("GitHub token saved");
  }

  async function handleCopyCode() {
    if (!userCode) return;
    try {
      await navigator.clipboard.writeText(userCode);
      toast.success("Code copied");
    } catch {
      toast.error("Couldn’t copy the code");
    }
  }

  return (
    <div className="border-t border-separator px-3 py-2">
      <div className="mb-1 text-[12px] font-semibold">GitHub</div>
      <p className="mb-2 text-[11px] text-tertiary">
        Sign in to download updates from the private repository. This asks for the{" "}
        <code className="text-[10.5px]">repo</code> scope.
      </p>

      {needsClientId && !pending && !signedIn ? (
        <div className="mb-2">
          <p className="mb-2 text-[11px] text-tertiary">
            Paste the OAuth App client ID (Device Authorization Grant enabled). The client secret is
            unused.
          </p>
          <input
            value={clientIdDraft}
            onChange={(event) => setClientIdDraft(event.target.value)}
            placeholder="OAuth client ID"
            className="mb-2 h-8 w-full rounded-lg border border-separator bg-surface px-2 text-[12px]"
          />
          <Button
            size="small"
            variant="glass"
            onClick={() => {
              void (async () => {
                await setGithubOAuthClientId(clientIdDraft);
                setStoredClientId(clientIdDraft.trim() || null);
                toast.success(clientIdDraft.trim() ? "OAuth client ID saved" : "OAuth client ID cleared");
              })();
            }}
          >
            Save client ID
          </Button>
        </div>
      ) : null}

      {pending ? (
        <div className="mb-2 rounded-lg bg-control-subtle px-2.5 py-2">
          <div className="text-[11px] text-secondary">Enter this code in the browser GitHub opened:</div>
          <div className="mt-1 font-mono text-[15px] tracking-wide">{userCode}</div>
          <div className="mt-2 flex gap-2">
            <Button size="small" variant="glass" onClick={() => void handleCopyCode()}>
              Copy
            </Button>
            <Button size="small" variant="glass" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        </div>
      ) : signedIn ? (
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-[12px]">{statusLabel(auth)}</div>
          <Button size="small" variant="glass" onClick={() => void handleSignOut()}>
            Sign out
          </Button>
        </div>
      ) : (
        <Button size="small" variant="accent" onClick={() => void handleSignIn()}>
          Sign in with GitHub
        </Button>
      )}

      {pending ? null : (
        <div className="mt-2">
          <button
            type="button"
            className="flex items-center gap-1 text-[11px] text-tertiary"
            onClick={() => setTokenOpen((open) => !open)}
          >
            <ChevronDown className={cn("size-3.5 transition-transform", tokenOpen ? "rotate-0" : "-rotate-90")} />
            Or use a token
          </button>
          {tokenOpen ? (
            <div className="mt-2">
              <p className="mb-2 text-[11px] text-tertiary">
                Import from the gh CLI or paste a PAT with repo read access — useful for a
                single-repo fine-grained token.
              </p>
              <input
                type="password"
                value={tokenDraft}
                onChange={(event) => setTokenDraft(event.target.value)}
                placeholder="ghp_…"
                className="mb-2 h-8 w-full rounded-lg border border-separator bg-surface px-2 text-[12px]"
              />
              <div className="flex gap-2">
                <Button size="small" variant="glass" onClick={() => void handleImportGh()}>
                  Import from gh
                </Button>
                <Button size="small" variant="accent" onClick={() => void handleSavePat()}>
                  Save
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function statusLabel(auth: GithubAuth | null): string {
  if (auth?.source === "oauth" && auth.login) return `Signed in as @${auth.login}`;
  if (auth?.source === "oauth") return "Signed in with GitHub";
  if (auth?.source === "gh") return "Token imported from gh";
  return "GitHub token saved";
}
