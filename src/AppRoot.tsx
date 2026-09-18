/** Composition root — owns the QueryClient and mounts the panel app plus
 *  the global hosts. Domain state, provider fetches, and layout bodies
 *  live downstream. */

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ToastHost } from "./components/ui/ToastHost";
import { ThemeEditorHost } from "./components/appearance/ThemeEditorHost";
import { currentWindowLabel } from "./platform/windows";
import { PanelApp } from "./windows/PanelApp";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

export function AppRoot() {
  const label = currentWindowLabel();

  React.useEffect(() => {
    document.documentElement.dataset.window = label;
  }, [label]);

  return (
    <QueryClientProvider client={queryClient}>
      <PanelApp />
      <ToastHost />
      <ThemeEditorHost />
    </QueryClientProvider>
  );
}
