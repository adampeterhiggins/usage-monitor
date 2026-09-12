/** Persisted preference hooks — the observable edge of the settings
 *  document. Layout and the refresh shortcut each keep a write-through
 *  local copy. */

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import {
  getLayout,
  getRefreshShortcut,
  REFRESH_SHORTCUT_QUERY_KEY,
  setLayout as persistLayout,
} from "../lib/settings";
import type { Layout } from "../lib/settings/layout";
import { DEFAULT_REFRESH_SHORTCUT } from "../lib/settings/shortcuts";

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
