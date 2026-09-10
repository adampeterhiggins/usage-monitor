export interface Update {
  version: string;
  downloadAndInstall: (
    onEvent?: (event: { event: string; data: Record<string, unknown> }) => void,
    options?: unknown,
  ) => Promise<void>;
}

/** Up-to-date by default; a driver can flip this by stubbing `check` itself. */
export async function check(_options?: unknown): Promise<Update | null> {
  return null;
}
