import { findPodForWorkspace, selectContainer } from '../kube/exec.js';
import { ensureTerminalSession } from './terminal-session.js';
import { DEFAULT_SESSION_NAME } from '../types.js';

interface StartTerminalSessionParams {
  workspace: string;
  session_name?: string;
  container?: string;
}

export async function startTerminalSession(
  params: StartTerminalSessionParams,
): Promise<{ success: boolean; session_name: string }> {
  const sessionName = params.session_name || DEFAULT_SESSION_NAME;

  const { podName, containers } = await findPodForWorkspace(params.workspace);
  const containerName = selectContainer(containers, params.container);

  const created = await ensureTerminalSession(
    podName,
    containerName,
    sessionName,
  );
  if (!created) {
    throw new Error(
      `Session "${sessionName}" already exists in workspace "${params.workspace}"`,
    );
  }

  return { success: true, session_name: sessionName };
}
