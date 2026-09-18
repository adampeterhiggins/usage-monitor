import { useUpdates } from "../../state/updates";
import { formatBytes, formatPublished } from "../../lib/updates/service";
import { Button } from "../ui/button";

export function UpdatePanel() {
  const state = useUpdates();
  const pct = state.progress != null ? Math.round(state.progress * 100) : null;

  return (
    <div className="flex flex-col gap-2 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] text-ui-tertiary">
          {state.currentVersion ? `Running ${state.currentVersion}` : "Reading version…"}
        </div>
        <Button
          size="small"
          variant="glass"
          disabled={state.busy || state.phase === "downloading" || state.phase === "ready"}
          onClick={() => void state.check(true)}
        >
          {state.phase === "checking" ? "Checking…" : "Check now"}
        </Button>
      </div>

      {state.phase === "error" && state.error ? (
        <p className="text-[11px] text-ui-status-critical-text">{state.error}</p>
      ) : null}

      {state.phase === "up-to-date" ? (
        <p className="text-[11px] text-ui-secondary">
          Up to date.
          {state.lastCheckedAt ? ` Last checked ${new Date(state.lastCheckedAt).toLocaleString("en-GB")}.` : ""}
        </p>
      ) : null}

      {state.phase === "available" ? (
        <div className="flex flex-col gap-2">
          <p className="text-[12px]">
            Version <strong>{state.availableVersion}</strong> is available
            {formatPublished(state.publishedAt) ? `, published ${formatPublished(state.publishedAt)}` : ""}.
          </p>
          {state.notes ? (
            <pre
              data-selectable
              className="max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-ui-control p-2 text-[11px] text-ui-secondary"
            >
              {state.notes}
            </pre>
          ) : null}
          <Button variant="accent" size="small" onClick={() => void state.download()}>
            Download and install
          </Button>
        </div>
      ) : null}

      {state.phase === "downloading" ? (
        <div>
          <div className="mb-1 flex justify-between text-[11px]">
            <span>Downloading {state.availableVersion}</span>
            <span className="tabular-nums text-ui-tertiary">
              {pct != null ? `${pct}%` : formatBytes(state.downloadedBytes)}
              {state.totalBytes ? ` of ${formatBytes(state.totalBytes)}` : ""}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-ui-track">
            <div className="h-full rounded-full bg-ui-status-info" style={{ width: `${pct ?? 15}%` }} />
          </div>
        </div>
      ) : null}

      {state.phase === "ready" ? (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] text-ui-secondary">
            Version {state.availableVersion} is installed and takes effect after a restart.
          </p>
          <Button variant="accent" size="small" onClick={() => void state.restart()}>
            Restart now
          </Button>
        </div>
      ) : null}

      <p className="text-[10.5px] leading-relaxed text-ui-placeholder">
        Updates are checked against the project's GitHub releases — no sign-in needed.
      </p>
    </div>
  );
}
