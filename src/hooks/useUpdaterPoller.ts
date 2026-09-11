/** Run the updater's check-on-launch / every-6-hours poller for this window. */

import * as React from "react";

import { useUpdates } from "../state/updates";

export function useUpdaterPoller(): void {
  const startPoller = useUpdates((s) => s.startPoller);
  React.useEffect(() => startPoller(), [startPoller]);
}
