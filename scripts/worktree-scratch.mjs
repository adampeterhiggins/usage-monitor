#!/usr/bin/env node
/**
 * Where a linked worktree keeps what it builds, so the worktree can be deleted
 * without losing anything and without leaving gigabytes behind.
 *
 * In a linked worktree that is `node_modules/.cache/usage-monitor`: T3 Code's
 * automatic worktree cleanup refuses a worktree holding any ignored path other
 * than `node_modules`, and everything under here goes with the worktree. The
 * main checkout (and the release worktree, which sets
 * USAGE_MONITOR_WORKTREE_SCRATCH=0) keeps the usual `dist` and
 * `src-tauri/target`.
 *
 *   node scripts/worktree-scratch.mjs   # prints the directory, or nothing
 */
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** The scratch directory for this checkout, or null outside a linked worktree. */
export function worktreeScratch(cwd = process.cwd()) {
  if (process.env.USAGE_MONITOR_WORKTREE_SCRATCH === "0") return null;
  let out;
  try {
    out = execFileSync(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir", "--show-toplevel"],
      { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
  } catch {
    return null;
  }
  const [gitDir, commonDir, top] = out.trim().split("\n");
  // A linked worktree's git dir is its own, under the main one's worktrees/.
  if (gitDir === commonDir) return null;
  return join(top, "node_modules", ".cache", "usage-monitor");
}

/** Cargo's intermediate artifacts, shared by every worktree. The Makefile names the same path. */
export const SHARED_BUILD_DIR = join(homedir(), "Library", "Caches", "usage-monitor", "cargo-build");

/**
 * The environment a worktree builds with: Cargo's final output in the scratch
 * directory and its intermediates in the shared cache. Values already set win.
 */
export function worktreeCargoEnv(env = process.env, cwd = process.cwd()) {
  const scratch = worktreeScratch(cwd);
  if (!scratch) return env;
  return {
    ...env,
    CARGO_TARGET_DIR: env.CARGO_TARGET_DIR ?? join(scratch, "target"),
    CARGO_BUILD_BUILD_DIR: env.CARGO_BUILD_BUILD_DIR ?? SHARED_BUILD_DIR,
  };
}

/** Vite's output, which Tauri bundles: `dist`, or the scratch directory's in a worktree. */
export function distDir(cwd = process.cwd()) {
  const scratch = worktreeScratch(cwd);
  return scratch ? join(scratch, "dist") : "dist";
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const scratch = worktreeScratch();
  if (scratch) console.log(scratch);
}
