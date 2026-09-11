/** Persisted preference hooks — the observable edge of the settings
 *  document. Layout, refresh shortcut, and the GitHub token each keep a
 *  write-through local copy; the GitHub token also feeds the updater's
 *  auth headers. */

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import {
  getGithubToken,
  getLayout,
  getRefreshShortcut,
  REFRESH_SHORTCUT_QUERY_KEY,
  setLayout as persistLayout,
} from "../lib/settings";
import type { Layout } from "../lib/settings/layout";
import { DEFAULT_REFRESH_SHORTCUT } from "../lib/settings/shortcuts";
import { provideUpdateToken } from "./updates";

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

/** Stored GitHub token, kept in sync with the updater's auth headers. */
export function useGithubToken(): [
  string | null,
  React.Dispatch<React.SetStateAction<string | null>>,
] {
  const [githubToken, setGithubToken] = React.useState<string | null>(null);

  React.useEffect(() => {
    void getGithubToken().then(setGithubToken);
  }, []);

  React.useEffect(() => {
    provideUpdateToken(() => githubToken);
  }, [githubToken]);

  return [githubToken, setGithubToken];
}
