/** Persisted preference hooks — the observable edge of the settings
 *  document. Layout and the refresh shortcut each keep a write-through
 *  local copy. */

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import {
  getLayout,
  getRefreshShortcut,
  getWallColumns,
  REFRESH_SHORTCUT_QUERY_KEY,
  setLayout as persistLayout,
  setWallColumns as persistWallColumns,
} from "../lib/settings";
import type { Layout, WallColumns } from "../lib/settings/layout";
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

/** Persisted Wall column count with a write-through setter. */
export function useWallColumns(): [WallColumns, (next: WallColumns) => void] {
  const [columns, setColumns] = React.useState<WallColumns>(2);

  React.useEffect(() => {
    void getWallColumns().then(setColumns);
  }, []);

  const changeColumns = React.useCallback((next: WallColumns) => {
    setColumns(next);
    void persistWallColumns(next);
  }, []);

  return [columns, changeColumns];
}

/** The rebindable in-panel refresh shortcut (defaults to ⌘⏎). */
export function useRefreshShortcut(): string {
  const query = useQuery({ queryKey: REFRESH_SHORTCUT_QUERY_KEY, queryFn: getRefreshShortcut });
  return query.data ?? DEFAULT_REFRESH_SHORTCUT;
}
