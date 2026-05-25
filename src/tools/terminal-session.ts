import { execInPod } from '../kube/exec.js';
import { TMUX_HISTORY_LIMIT } from '../types.js';

export async function ensureTerminalSession(
  podName: string,
  containerName: string,
  sessionName: string,
): Promise<boolean> {
  const checkResult = await execInPod(podName, containerName, [
    'tmux',
    'has-session',
    '-t',
    sessionName,
  ]);

  if (checkResult.exitCode === 0) {
    return false; // session already exists
  }

  const createResult = await execInPod(podName, containerName, [
    'tmux',
    'new-session',
    '-d',
    '-s',
    sessionName,
    '-x',
    '200',
    '-y',
    '50',
  ]);

  if (createResult.exitCode !== 0) {
    const stderr = createResult.stderr.toLowerCase();
    if (stderr.includes('not found') || createResult.exitCode === 127) {
      throw new Error(
        'tmux not found in container. The workspace image must include tmux.',
      );
    }
    throw new Error(`Failed to create tmux session: ${createResult.stderr}`);
  }

  await execInPod(podName, containerName, [
    'tmux',
    'set-option',
    '-t',
    sessionName,
    'remain-on-exit',
    'on',
  ]);

  await execInPod(podName, containerName, [
    'tmux',
    'set-option',
    '-t',
    sessionName,
    'history-limit',
    String(TMUX_HISTORY_LIMIT),
  ]);

  return true; // session was created
}
