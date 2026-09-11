import { create } from "zustand";
import type { PendingUpdate } from "../contracts/platform";
import {
  checkForUpdate,
  currentVersion,
  describeUpdateError,
  initialUpdateState,
  installUpdate,
  restartToApply,
  type UpdateState,
} from "./api";

let pendingUpdate: PendingUpdate | null = null;

const STARTUP_DELAY_MS = 15_000;
const POLL_INTERVAL_MS = 6 * 60 * 60 * 1000;

interface UpdateStore extends UpdateState {
  busy: boolean;
  pollerStarted: boolean;
  loadVersion: () => Promise<void>;
  check: (manual: boolean) => Promise<void>;
  download: () => Promise<void>;
  restart: () => Promise<void>;
  startPoller: () => () => void;
}

export const useUpdates = create<UpdateStore>((set, get) => ({
  ...initialUpdateState,
  busy: false,
  pollerStarted: false,

  loadVersion: async () => {
    try {
      set({ currentVersion: await currentVersion() });
    } catch {
      // Outside a Tauri window there is no app version.
    }
  },

  check: async (manual) => {
    if (get().busy) return;
    const phase = get().phase;
    if (phase === "downloading" || phase === "ready" || phase === "installing") return;

    set({ busy: true });
    if (manual) set({ phase: "checking", error: null });

    try {
      const token = readToken();
      const { update, state } = await checkForUpdate(token);
      pendingUpdate = update;
      set(state);
    } catch (err) {
      if (manual) set({ phase: "error", error: describeUpdateError(err) });
      else set({ error: null });
    } finally {
      set({ busy: false });
    }
  },

  download: async () => {
    if (!pendingUpdate || get().busy) return;
    set({ busy: true });
    try {
      await installUpdate(pendingUpdate, readToken(), (p) => set(p));
    } catch (err) {
      set({ phase: "error", error: describeUpdateError(err) });
    } finally {
      set({ busy: false });
    }
  },

  restart: async () => {
    set({ phase: "installing" });
    try {
      await restartToApply();
    } catch (err) {
      set({ phase: "error", error: describeUpdateError(err) });
    }
  },

  startPoller: () => {
    if (get().pollerStarted) return () => {};
    set({ pollerStarted: true });
    void get().loadVersion();
    const startup = setTimeout(() => void get().check(false), STARTUP_DELAY_MS);
    const poll = setInterval(() => void get().check(false), POLL_INTERVAL_MS);
    return () => {
      clearTimeout(startup);
      clearInterval(poll);
      set({ pollerStarted: false });
    };
  },
}));

let tokenGetter: () => string | null = () => null;

export function provideUpdateToken(getter: () => string | null): void {
  tokenGetter = getter;
}

function readToken(): string | null {
  return tokenGetter();
}
