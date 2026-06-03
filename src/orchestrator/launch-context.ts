export interface LaunchContextParams {
  workspace: string;
  agentType: string;
  task: string;
  tools: string[];
  branch?: string;
  workingDirectory?: string;
}

export function buildLaunchContext(params: LaunchContextParams): string {
  const { workspace, task, branch, workingDirectory } = params;
  const lines = [
    `Workspace: ${workspace}`,
    branch ? `Branch: ${branch}` : null,
    `Work directory: ${workingDirectory ?? '/projects'}`,
    '',
    task,
  ].filter((l): l is string => l !== null);

  return lines.join('\n');
}
