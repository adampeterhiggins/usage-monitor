export async function relaunch(): Promise<void> {
  console.info("[mock-tauri] relaunch() — no-op in browser mode");
}

export async function exit(code = 0): Promise<never> {
  console.info(`[mock-tauri] exit(${code}) — no-op in browser mode`);
  // Never resolves: matches the real command, which terminates the process.
  return new Promise<never>(() => {});
}
