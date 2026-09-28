export function worktreeScratch(cwd?: string): string | null;
export const SHARED_BUILD_DIR: string;
export function worktreeCargoEnv(
  env?: Record<string, string | undefined>,
  cwd?: string,
): Record<string, string | undefined>;
export function distDir(cwd?: string): string;
