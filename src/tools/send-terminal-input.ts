import {
  findPodForWorkspace,
  selectContainer,
  execInPod,
} from '../kube/exec.js';
import { DEFAULT_SESSION_NAME } from '../types.js';

interface SendTerminalInputParams {
  workspace: string;
  text: string;
  session_name?: string;
  enter?: boolean;
  container?: string;
}

export async function sendTerminalInput(
  params: SendTerminalInputParams,
): Promise<{ success: boolean }> {
  const sessionName = params.session_name || DEFAULT_SESSION_NAME;
  const enter = params.enter !== undefined ? params.enter : true;

  const { podName, containers } = await findPodForWorkspace(params.workspace);
  const containerName = selectContainer(containers, params.container);

  // Send text with literal flag to avoid shell interpretation
  const textResult = await execInPod(podName, containerName, [
    'tmux',
    'send-keys',
    '-t',
    sessionName,
    '-l',
    params.text,
  ]);

  if (textResult.exitCode !== 0) {
    throw new Error(`Session "${sessionName}" not found`);
  }

  // Optionally send Enter
  if (enter) {
    await execInPod(podName, containerName, [
      'tmux',
      'send-keys',
      '-t',
      sessionName,
      'Enter',
    ]);
  }

  return { success: true };
}
