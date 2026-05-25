import {
  findPodForWorkspace,
  selectContainer,
  execInPod,
} from '../kube/exec.js';
import { DEFAULT_SESSION_NAME } from '../types.js';

interface StopTerminalSessionParams {
  workspace: string;
  session_name?: string;
  container?: string;
}

export async function stopTerminalSession(
  params: StopTerminalSessionParams,
): Promise<{ success: boolean }> {
  const sessionName = params.session_name || DEFAULT_SESSION_NAME;

  const { podName, containers } = await findPodForWorkspace(params.workspace);
  const containerName = selectContainer(containers, params.container);

  await execInPod(podName, containerName, [
    'tmux',
    'kill-session',
    '-t',
    sessionName,
  ]);

  // Always return success (idempotent - session may already be dead)
  return { success: true };
}
