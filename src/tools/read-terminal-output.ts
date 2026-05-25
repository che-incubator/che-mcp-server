import {
  findPodForWorkspace,
  selectContainer,
  execInPod,
} from '../kube/exec.js';
import { DEFAULT_SESSION_NAME, DEFAULT_LINES } from '../types.js';

interface ReadTerminalOutputParams {
  workspace: string;
  session_name?: string;
  lines?: number;
  container?: string;
}

export async function readTerminalOutput(
  params: ReadTerminalOutputParams,
): Promise<{ output: string; lines_returned: number }> {
  const sessionName = params.session_name || DEFAULT_SESSION_NAME;
  const lines = params.lines || DEFAULT_LINES;

  const { podName, containers } = await findPodForWorkspace(params.workspace);
  const containerName = selectContainer(containers, params.container);

  const result = await execInPod(podName, containerName, [
    'tmux',
    'capture-pane',
    '-t',
    sessionName,
    '-p',
    '-S',
    `-${lines}`,
  ]);

  if (result.exitCode !== 0) {
    throw new Error(`Session "${sessionName}" not found`);
  }

  // Count actual lines (non-empty trailing lines)
  const output = result.stdout;
  const lineCount = output.split('\n').filter((line, idx, arr) => {
    // Count all lines except trailing empty ones
    const isLastLine = idx === arr.length - 1;
    return !isLastLine || line.length > 0;
  }).length;

  return {
    output,
    lines_returned: lineCount,
  };
}
