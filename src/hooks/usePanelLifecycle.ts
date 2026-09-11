/** Panel lifecycle hooks: the global toggle shortcut, the account-modal
 *  bridge, tray show events, and the interval tick. */

import * as React from "react";

import { initToggleShortcut } from "../platform/global-shortcut";
import { onPanelShown, setAccountModalOpen } from "../platform/windows";
import { getToggleShortcut } from "../lib/settings";

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
    void setAccountModalOpen(open).catch(() => {
      // Older native builds without the command keep tray hide-on-blur.
    });
  }, [open]);

  React.useEffect(() => {
    return () => {
      void setAccountModalOpen(false).catch(() => {});
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

/** Refresh (respecting TTL/backoff) each time the tray panel is shown. */
export function useWindowShownRefresh(options: {
  skip: boolean;
  onShown: () => void;
}): void {
  const { skip, onShown } = options;

  React.useEffect(
    () =>
      onPanelShown(() => {
        // Make sure the document owns keyboard focus so Escape works without a click first.
        window.focus();
        if (skip) return;
        // Respect TTL / backoff. A forced refresh here re-hit Claude's OAuth
        // token endpoint on every tray open and burned the sign-in rate limit.
        onShown();
      }),
    [skip, onShown],
  );
}
