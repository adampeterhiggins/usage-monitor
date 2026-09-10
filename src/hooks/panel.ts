import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useQuery } from "@tanstack/react-query";
import { initToggleShortcut } from "../lib/platform/global-shortcut";
import {
  acceleratorFromKeyDown,
  DEFAULT_REFRESH_SHORTCUT,
} from "../lib/platform/shortcut";
import {
  getLayout,
  getRefreshShortcut,
  getToggleShortcut,
  REFRESH_SHORTCUT_QUERY_KEY,
  setLayout as persistLayout,
} from "../lib/settings";
import type { Layout } from "../lib/usage/types";

/** Persisted panel layout with a write-through setter. */
export function useLayout(): [Layout, (next: Layout) => void] {
  const [layout, setLayout] = React.useState<Layout>("wall");

  React.useEffect(() => {
    void getLayout().then(setLayout);
  }, []);

  const changeLayout = React.useCallback((next: Layout) => {
    setLayout(next);
    void persistLayout(next);
  }, []);

  return [layout, changeLayout];
}

/** The rebindable in-panel refresh shortcut (defaults to ⌘⏎). */
export function useRefreshShortcut(): string {
  const query = useQuery({ queryKey: REFRESH_SHORTCUT_QUERY_KEY, queryFn: getRefreshShortcut });
  return query.data ?? DEFAULT_REFRESH_SHORTCUT;
}

/** Register the saved global show/hide shortcut once on mount. */
export function useToggleShortcut(): void {
  React.useEffect(() => {
    void getToggleShortcut().then((saved) => initToggleShortcut(saved));
  }, []);
}

/**
 * Tell the native side whether an account modal is up so tray hide-on-blur
 * stays off while it is.
 */
export function useModalOpenBridge(open: boolean): void {
  React.useEffect(() => {
    // Do not send `open: false` from this effect's cleanup — React Strict Mode
    // remounts immediately and that race left the panel hidden / accessory
    // while the modal was still open.
    void invoke("set_account_modal_open", { open }).catch(() => {
      // Older native builds without the command keep tray hide-on-blur.
    });
  }, [open]);

  React.useEffect(() => {
    return () => {
      void invoke("set_account_modal_open", { open: false }).catch(() => {});
    };
  }, []);
}

/** Periodic re-render so relative timestamps ("5 min ago") stay fresh. */
export function useIntervalTick(intervalMs: number): void {
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
}

/** Escape hides the panel; the configured accelerator refreshes all accounts. */
export function usePanelKeys(options: {
  refreshShortcut: string;
  blockingOverlay: boolean;
  canRefresh: boolean;
  onRefreshAll: () => void;
}): void {
  const { refreshShortcut, blockingOverlay, canRefresh, onRefreshAll } = options;

  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (blockingOverlay) return;
        void invoke("hide_window");
        return;
      }
      const accelerator = acceleratorFromKeyDown(e, { allowBareKey: true });
      if (!accelerator || accelerator !== refreshShortcut) return;
      if (blockingOverlay || !canRefresh) return;
      e.preventDefault();
      onRefreshAll();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [refreshShortcut, blockingOverlay, canRefresh, onRefreshAll]);
}

/** Refresh (respecting TTL/backoff) each time the tray panel is shown. */
export function useWindowShownRefresh(options: {
  skip: boolean;
  onShown: () => void;
}): void {
  const { skip, onShown } = options;

  React.useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen("window:shown", () => {
      // Make sure the document owns keyboard focus so Escape works without a click first.
      window.focus();
      if (skip) return;
      // Respect TTL / backoff. A forced refresh here re-hit Claude's OAuth
      // token endpoint on every tray open and burned the sign-in rate limit.
      onShown();
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, [skip, onShown]);
}
