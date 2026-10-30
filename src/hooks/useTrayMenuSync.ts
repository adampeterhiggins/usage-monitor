/** Keep the native status-item menu's usage summary current, and route its
 *  open and Refresh signals back to the panel's refresh policy. */

import * as React from "react";

import type { AccountPublic } from "../contracts/accounts";
import type { AccountFetchState } from "../contracts/usage";
import { buildTrayMenuSnapshot } from "../lib/usage/trayMenu";
import { onTrayMenuOpened, onTrayRefreshRequested, setTrayMenu } from "../platform/trayMenu";

/** Relative reset times ("resets in 3 hr 12 min") drift while nothing else
 *  changes, so the snapshot is rebuilt on this beat as well as on new data. */
const REPUBLISH_MS = 30_000;

export function useTrayMenuSync(options: {
  /** False until the account list has loaded — an empty menu would flash. */
  enabled: boolean;
  accounts: AccountPublic[];
  states: Record<string, AccountFetchState>;
  /** The menu opened: refresh, respecting TTL and backoff. */
  onOpened: () => void;
  /** Refresh was chosen in the menu. */
  onRefresh: () => void;
}): void {
  const { enabled, accounts, states, onOpened, onRefresh } = options;
  const published = React.useRef<string | undefined>(undefined);

  React.useEffect(() => {
    if (!enabled) return;
    const publish = () => {
      const snapshot = buildTrayMenuSnapshot(accounts, states);
      const json = JSON.stringify(snapshot);
      if (json === published.current) return;
      published.current = json;
      void setTrayMenu(snapshot).catch(() => {
        // Try again on the next change or beat.
        published.current = undefined;
      });
    };
    publish();
    const id = window.setInterval(publish, REPUBLISH_MS);
    return () => window.clearInterval(id);
  }, [enabled, accounts, states]);

  // Subscribe once; the handlers change every render.
  const handlers = React.useRef({ onOpened, onRefresh });
  handlers.current = { onOpened, onRefresh };
  React.useEffect(() => onTrayMenuOpened(() => handlers.current.onOpened()), []);
  React.useEffect(() => onTrayRefreshRequested(() => handlers.current.onRefresh()), []);
}
