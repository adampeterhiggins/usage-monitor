/** In-panel keyboard handling: Escape hides the panel; the configured
 *  accelerator refreshes all accounts. */

import * as React from "react";

import { hidePanel } from "../platform/windows";
import { acceleratorFromKeyDown } from "../lib/settings/shortcuts";

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
        void hidePanel();
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
