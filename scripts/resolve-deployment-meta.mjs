/**
 * Resolve branch / PR / commit / version for the deployment popover.
 *
 * Mirrors orchestra's branch_pr_banner_env.sh: prefer explicit VITE_* env
 * (CI, a wrapper script), then git / gh. Failures are swallowed so a missing
 * `gh` or a detached HEAD does not break `tauri dev` / the release build.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function optionalEnv(name) {
  const value = process.env[name];
  if (value === undefined) return "";
  const trimmed = value.trim();
  return trimmed;
}

function run(cmd, args) {
  try {
    return execFileSync(cmd, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 4000,
    }).trim();
  } catch {
    return "";
  }
}

export function resolveDeploymentMeta(cwd = process.cwd()) {
  const pkg = JSON.parse(readFileSync(resolve(cwd, "package.json"), "utf8"));
  const version = optionalEnv("VITE_APP_VERSION") || pkg.version || "";
  const branchRaw = optionalEnv("VITE_GIT_BRANCH") || run("git", ["-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"]);
  const branch = branchRaw === "HEAD" ? "" : branchRaw;
  const commit = optionalEnv("VITE_GIT_COMMIT") || run("git", ["-C", cwd, "rev-parse", "HEAD"]);

  let prNumber = optionalEnv("VITE_PR_NUMBER");
  let prUrl = optionalEnv("VITE_PR_URL");
  if (!prNumber && branch) {
    const raw = run("gh", [
      "pr",
      "list",
      "--head",
      branch,
      "--state",
      "open",
      "--json",
      "number,url",
      "--jq",
      ".[0] // empty",
    ]);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.number === "number" && parsed.number > 0) {
          prNumber = String(parsed.number);
          if (!prUrl && typeof parsed.url === "string") prUrl = parsed.url;
        }
      } catch {
        // ignore malformed gh output
      }
    }
  }

  return { version, branch, commit, prNumber, prUrl };
}
