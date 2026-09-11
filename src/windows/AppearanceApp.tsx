/** The Appearance window — its own lifecycle, deliberately no panel
 *  shortcuts, updater polling, or account state. Closing signals the
 *  native side so blur-hide behavior resumes. */

import * as React from "react";

import { AppearancePanel } from "../components/appearance/AppearancePanel";
import { useAppearanceRefresh } from "../hooks/useAppearanceRefresh";
import { notifyAppearanceClosed } from "../platform/appearance-window";

export function AppearanceApp() {
  useAppearanceRefresh({ listenForExternalChanges: false });

  React.useEffect(() => {
    return () => {
      void notifyAppearanceClosed();
    };
  }, []);

  return <AppearancePanel />;
}
