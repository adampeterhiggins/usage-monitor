export function resolveDeploymentMeta(cwd?: string): {
  version: string;
  branch: string;
  commit: string;
  prNumber: string;
  prUrl: string;
};
