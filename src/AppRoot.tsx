/** Composition root — owns the QueryClient, picks the window app by its
 *  native label, and mounts the global hosts. Domain state, provider
 *  fetches, and layout bodies live downstream. */

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ToastHost } from "./components/ui/ToastHost";
import { ThemeEditorHost } from "./components/appearance/ThemeEditorHost";
import { currentWindowLabel } from "./platform/windows";
import { APPEARANCE_WINDOW_LABEL } from "./platform/appearance-window";
import { AppearanceApp } from "./windows/AppearanceApp";
import { PanelApp } from "./windows/PanelApp";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

export function AppRoot() {
  const label = currentWindowLabel();
  const isAppearanceWindow = label === APPEARANCE_WINDOW_LABEL;

  React.useEffect(() => {
    document.documentElement.dataset.window = label;
  }, [label]);

  return (
    <QueryClientProvider client={queryClient}>
      {isAppearanceWindow ? <AppearanceApp /> : <PanelApp />}
      <ToastHost />
      {isAppearanceWindow ? <ThemeEditorHost /> : null}
    </QueryClientProvider>
  );
}
