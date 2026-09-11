import type { PendingUpdate } from "../../contracts/platform";
import { appVersion, restartApp } from "../../platform/app";
import { checkNativeUpdate } from "../../platform/updates";

export type UpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "up-to-date"
  | "downloading"
  | "ready"
  | "installing"
  | "error";

export interface UpdateState {
  phase: UpdatePhase;
  currentVersion: string | null;
  availableVersion: string | null;
  notes: string | null;
  publishedAt: string | null;
  progress: number | null;
  downloadedBytes: number;
  totalBytes: number | null;
  error: string | null;
  lastCheckedAt: string | null;
}

export const initialUpdateState: UpdateState = {
  phase: "idle",
  currentVersion: null,
  availableVersion: null,
  notes: null,
  publishedAt: null,
  progress: null,
  downloadedBytes: 0,
  totalBytes: null,
  error: null,
  lastCheckedAt: null,
};

export async function currentVersion(): Promise<string> {
  return appVersion();
}

function authHeaders(token: string | null): Record<string, string> | undefined {
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

export interface CheckOutcome {
  update: PendingUpdate | null;
  state: Partial<UpdateState>;
}

export async function checkForUpdate(token: string | null): Promise<CheckOutcome> {
  const version = await currentVersion();
  const headers = authHeaders(token);

  const update = await checkNativeUpdate(headers);
  const lastCheckedAt = new Date().toISOString();

  if (!update) {
    return {
      update: null,
      state: {
        phase: "up-to-date",
        currentVersion: version,
        availableVersion: null,
        notes: null,
        error: null,
        lastCheckedAt,
      },
    };
  }

  return {
    update,
    state: {
      phase: "available",
      currentVersion: update.currentVersion ?? version,
      availableVersion: update.version,
      notes: update.notes,
      publishedAt: update.publishedAt,
      error: null,
      lastCheckedAt,
    },
  };
}

export async function installUpdate(
  update: PendingUpdate,
  token: string | null,
  onProgress: (patch: Partial<UpdateState>) => void,
): Promise<void> {
  let downloaded = 0;
  let total: number | null = null;

  onProgress({ phase: "downloading", downloadedBytes: 0, totalBytes: null, progress: null });

  await update.downloadAndInstall((event) => {
    switch (event.type) {
      case "started":
        total = event.contentLength ?? null;
        onProgress({ totalBytes: total, downloadedBytes: 0, progress: total ? 0 : null });
        break;
      case "progress":
        downloaded += event.chunkLength;
        onProgress({
          downloadedBytes: downloaded,
          progress: total ? Math.min(1, downloaded / total) : null,
        });
        break;
      case "finished":
        onProgress({ phase: "ready", progress: 1 });
        break;
    }
  }, authHeaders(token));

  onProgress({ phase: "ready", progress: 1 });
}

export async function restartToApply(): Promise<void> {
  await restartApp();
}

export function formatPublished(raw: string | null): string | null {
  if (!raw) return null;
  const candidates = [
    raw,
    raw.replace(" ", "T").replace(/ \+00:00:00$/, "Z").replace(/ ([+-]\d{2}):(\d{2}):\d{2}$/, "$1:$2"),
  ];
  for (const c of candidates) {
    const d = new Date(c);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    }
  }
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  return mb < 1 ? `${Math.round(bytes / 1024)} KB` : `${mb.toFixed(1)} MB`;
}

export function describeUpdateError(err: unknown): string {
  const message = (err as Error)?.message ?? String(err);

  if (/404|not found/i.test(message)) {
    return (
      "Could not read the update manifest (404). Either no release has been published yet, " +
      "or the stored GitHub token lacks read access to this repository."
    );
  }
  if (/401|403|unauthor|forbidden/i.test(message)) {
    return "GitHub rejected the credentials for the update check. Re-check the token in Settings.";
  }
  if (/signature|minisign|pubkey/i.test(message)) {
    return (
      "The downloaded update failed signature verification. It was not installed. " +
      "This usually means the release was signed with a different key than this build trusts."
    );
  }
  return message;
}
