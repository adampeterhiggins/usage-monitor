#!/usr/bin/env node
/**
 * `npm run tauri`, building out of a linked worktree's way like the Makefile
 * does (see scripts/worktree-scratch.mjs). Outside a worktree it is plain
 * `tauri`.
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { distDir, worktreeCargoEnv, worktreeScratch } from "./worktree-scratch.mjs";

const args = process.argv.slice(2);

// tauri.conf.json bundles ../dist; in a worktree Vite writes elsewhere, so the
// build is pointed there. --config merges into the file's config, and goes
// straight after `build` because anything after a `--` is Cargo's.
if (args[0] === "build" && worktreeScratch()) {
  args.splice(1, 0, "--config", JSON.stringify({ build: { frontendDist: resolve(distDir()) } }));
}

const result = spawnSync("tauri", args, {
  stdio: "inherit",
  env: worktreeCargoEnv(),
});
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
