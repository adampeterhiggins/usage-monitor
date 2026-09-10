import * as React from "react";
import { getGithubToken } from "../lib/settings";
import { provideUpdateToken, useUpdates } from "../lib/updates/store";

/** Stored GitHub token, kept in sync with the updater's auth headers. */
export function useGithubToken(): [string | null, React.Dispatch<React.SetStateAction<string | null>>] {
  const [githubToken, setGithubToken] = React.useState<string | null>(null);

  React.useEffect(() => {
    void getGithubToken().then(setGithubToken);
  }, []);

  React.useEffect(() => {
    provideUpdateToken(() => githubToken);
  }, [githubToken]);

  return [githubToken, setGithubToken];
}

/** Run the updater's check-on-launch / every-6-hours poller for this window. */
export function useUpdaterPoller(): void {
  const startPoller = useUpdates((s) => s.startPoller);
  React.useEffect(() => startPoller(), [startPoller]);
}
