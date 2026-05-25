import {
  findPodForWorkspace,
  selectContainer,
  execInPod,
} from '../kube/exec.js';
import { ensureTerminalSession } from './terminal-session.js';
import {
  DEFAULT_SESSION_NAME,
  DEFAULT_EXEC_TIMEOUT_SECONDS,
  EXEC_CAPTURE_LINES,
} from '../types.js';

interface ExecInWorkspaceParams {
  workspace: string;
  command: string;
  timeout_seconds?: number;
  session_name?: string;
  container?: string;
}

interface ExecInWorkspaceResult {
  output: string;
  session_name: string;
  note: string;
}

export async function execInWorkspace(
  params: ExecInWorkspaceParams,
): Promise<ExecInWorkspaceResult> {
  const sessionName = params.session_name || DEFAULT_SESSION_NAME;
  const timeoutSeconds = params.timeout_seconds ?? DEFAULT_EXEC_TIMEOUT_SECONDS;

  const { podName, containers } = await findPodForWorkspace(params.workspace);
  const containerName = selectContainer(containers, params.container);

  await ensureTerminalSession(podName, containerName, sessionName);

  await execInPod(podName, containerName, [
    'tmux',
    'send-keys',
    '-t',
    sessionName,
    '-l',
    params.command,
  ]);
  await execInPod(podName, containerName, [
    'tmux',
    'send-keys',
    '-t',
    sessionName,
    'Enter',
  ]);

  await new Promise<void>((resolve) =>
    setTimeout(resolve, timeoutSeconds * 1000),
  );

  const captureResult = await execInPod(podName, containerName, [
    'tmux',
    'capture-pane',
    '-t',
    sessionName,
    '-p',
    '-S',
    `-${EXEC_CAPTURE_LINES}`,
  ]);

  if (captureResult.exitCode !== 0) {
    throw new Error(
      `Session "${sessionName}" not found or died before output could be captured`,
    );
  }

  return {
    output: captureResult.stdout,
    session_name: sessionName,
    note: `Output captured after ${timeoutSeconds}s. If the command is still running, use read_terminal_output to get more.`,
  };
}
