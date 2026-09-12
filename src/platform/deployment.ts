export const GITHUB_REPOSITORY = "adampeterhiggins/usage-monitor";

export interface DeploymentInfo {
  version: string | null;
  branch: string | null;
  prNumber: number | null;
  prUrl: string | null;
  commit: string | null;
  commitShort: string | null;
  commitUrl: string | null;
}

function optionalString(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function optionalPositiveInt(value: string | undefined): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export function buildCommitUrl(sha: string): string {
  return `https://github.com/${GITHUB_REPOSITORY}/commit/${sha}`;
}

export function buildPullRequestUrl(prNumber: number): string {
  return `https://github.com/${GITHUB_REPOSITORY}/pull/${prNumber}`;
}

export function shortCommit(sha: string): string {
  return sha.slice(0, 7);
}

/** Read branch / PR / commit baked into the Vite bundle at dev or build time. */
export function readBakedDeploymentInfo(): Omit<DeploymentInfo, "version"> & { bakedVersion: string | null } {
  const branch = optionalString(import.meta.env.VITE_GIT_BRANCH);
  const commit = optionalString(import.meta.env.VITE_GIT_COMMIT);
  const bakedVersion = optionalString(import.meta.env.VITE_APP_VERSION);
  const prNumber = optionalPositiveInt(import.meta.env.VITE_PR_NUMBER);
  const prUrl =
    optionalString(import.meta.env.VITE_PR_URL) ?? (prNumber !== null ? buildPullRequestUrl(prNumber) : null);

  return {
    bakedVersion,
    branch,
    prNumber,
    prUrl,
    commit,
    commitShort: commit !== null ? shortCommit(commit) : null,
    commitUrl: commit !== null ? buildCommitUrl(commit) : null,
  };
}

export function mergeDeploymentInfo(version: string | null): DeploymentInfo {
  const baked = readBakedDeploymentInfo();
  return {
    version: version ?? baked.bakedVersion,
    branch: baked.branch,
    prNumber: baked.prNumber,
    prUrl: baked.prUrl,
    commit: baked.commit,
    commitShort: baked.commitShort,
    commitUrl: baked.commitUrl,
  };
}
