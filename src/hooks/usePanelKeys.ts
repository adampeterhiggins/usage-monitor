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
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (blockingOverlay) return;
        void hidePanel();
      }
    }
    function handleRefresh(e: KeyboardEvent) {
      const accelerator = acceleratorFromKeyDown(e, { allowBareKey: true });
      if (!accelerator || accelerator !== refreshShortcut) return;
      if (blockingOverlay) return;
      // Reserve the shortcut before focused controls can activate themselves,
      // even while a refresh is running and another refresh cannot start.
      e.preventDefault();
      e.stopPropagation();
      if (canRefresh) onRefreshAll();
    }
    window.addEventListener("keydown", handleRefresh, true);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleRefresh, true);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [refreshShortcut, blockingOverlay, canRefresh, onRefreshAll]);
}
