import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/kube/client.js');
vi.mock('../../src/kube/exec.js');
vi.mock('../../src/kube/annotations.js');
vi.mock('../../src/tools/get-terminal-state.js');

describe('getWorkspaceCapacity', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('returns capacity for a workspace with no running agents', async () => {
    const { findPodForWorkspace } = await import('../../src/kube/exec.js');
    const { getCoreV1Api, getNamespace } = await import('../../src/kube/client.js');
    const { readAgentSessions } = await import('../../src/kube/annotations.js');

    vi.mocked(findPodForWorkspace).mockResolvedValue({ podName: 'ws-pod-1', containers: ['dev'] });
    vi.mocked(getNamespace).mockReturnValue('user-che');
    vi.mocked(getCoreV1Api).mockReturnValue({
      readNamespacedPod: vi.fn().mockResolvedValue({
        spec: {
          containers: [
            { name: 'dev', resources: { limits: { memory: '8Gi', cpu: '4' } } },
            { name: 'che-gateway', resources: { limits: { memory: '256Mi', cpu: '500m' } } },
          ],
        },
      }),
    } as any);
    vi.mocked(readAgentSessions).mockResolvedValue([]);

    const { getWorkspaceCapacity } = await import('../../src/tools/get-workspace-capacity.js');
    const result = await getWorkspaceCapacity({ workspace: 'my-ws' });

    expect(result).toEqual({
      workspace: 'my-ws',
      memory_limit_gi: 8,
      cpu_limit: 4,
      running_agents: 0,
      max_agents: 4,
      available_slots: 4,
    });
  });

  it('subtracts running agents from available slots when all sessions alive', async () => {
    const { findPodForWorkspace } = await import('../../src/kube/exec.js');
    const { getCoreV1Api, getNamespace } = await import('../../src/kube/client.js');
    const { readAgentSessions } = await import('../../src/kube/annotations.js');
    const { getTerminalState } = await import('../../src/tools/get-terminal-state.js');

    vi.mocked(findPodForWorkspace).mockResolvedValue({ podName: 'ws-pod-1', containers: ['dev'] });
    vi.mocked(getNamespace).mockReturnValue('user-che');
    vi.mocked(getCoreV1Api).mockReturnValue({
      readNamespacedPod: vi.fn().mockResolvedValue({
        spec: { containers: [{ name: 'dev', resources: { limits: { memory: '8Gi', cpu: '4' } } }] },
      }),
    } as any);
    vi.mocked(readAgentSessions).mockResolvedValue([
      { session_id: 'a-1', backend: 'claude-code', status: 'running', working_dir: '/projects', task: 't1', launched_at: '' },
      { session_id: 'a-2', backend: 'opencode', status: 'running', working_dir: '/projects', task: 't2', launched_at: '' },
    ]);
    vi.mocked(getTerminalState).mockResolvedValue({ session_alive: true, process_running: true, exit_code: null });

    const { getWorkspaceCapacity } = await import('../../src/tools/get-workspace-capacity.js');
    const result = await getWorkspaceCapacity({ workspace: 'my-ws' });

    expect((result as any).running_agents).toBe(2);
    expect((result as any).available_slots).toBe(2);
  });

  it('propagates API errors from readAgentSessions', async () => {
    const { findPodForWorkspace } = await import('../../src/kube/exec.js');
    const { getCoreV1Api, getNamespace } = await import('../../src/kube/client.js');
    const { readAgentSessions } = await import('../../src/kube/annotations.js');

    vi.mocked(findPodForWorkspace).mockResolvedValue({ podName: 'ws-pod-1', containers: ['dev'] });
    vi.mocked(getNamespace).mockReturnValue('user-che');
    vi.mocked(getCoreV1Api).mockReturnValue({
      readNamespacedPod: vi.fn().mockResolvedValue({
        spec: {
          containers: [
            { name: 'dev', resources: { limits: { memory: '8Gi', cpu: '4' } } },
          ],
        },
      }),
    } as any);

    const apiError = Object.assign(new Error('Internal Server Error'), { statusCode: 500 });
    vi.mocked(readAgentSessions).mockRejectedValue(apiError);

    const { getWorkspaceCapacity } = await import('../../src/tools/get-workspace-capacity.js');

    await expect(getWorkspaceCapacity({ workspace: 'my-ws' })).rejects.toThrow('Internal Server Error');
  });

  it('available_slots is never negative', async () => {
    const { findPodForWorkspace } = await import('../../src/kube/exec.js');
    const { getCoreV1Api, getNamespace } = await import('../../src/kube/client.js');
    const { readAgentSessions } = await import('../../src/kube/annotations.js');
    const { getTerminalState } = await import('../../src/tools/get-terminal-state.js');

    vi.mocked(findPodForWorkspace).mockResolvedValue({ podName: 'ws-pod-1', containers: ['dev'] });
    vi.mocked(getNamespace).mockReturnValue('user-che');
    vi.mocked(getCoreV1Api).mockReturnValue({
      readNamespacedPod: vi.fn().mockResolvedValue({
        spec: { containers: [{ name: 'dev', resources: { limits: { memory: '2Gi', cpu: '1' } } }] },
      }),
    } as any);
    vi.mocked(readAgentSessions).mockResolvedValue([
      { session_id: 'a-1', backend: 'claude-code', status: 'running', working_dir: '/p', task: 't', launched_at: '' },
      { session_id: 'a-2', backend: 'claude-code', status: 'running', working_dir: '/p', task: 't', launched_at: '' },
      { session_id: 'a-3', backend: 'claude-code', status: 'running', working_dir: '/p', task: 't', launched_at: '' },
    ]);
    vi.mocked(getTerminalState).mockResolvedValue({ session_alive: true, process_running: true, exit_code: null });

    const { getWorkspaceCapacity } = await import('../../src/tools/get-workspace-capacity.js');
    const result = await getWorkspaceCapacity({ workspace: 'my-ws' });

    expect((result as any).available_slots).toBe(0);
  });

  it('prunes dead sessions and counts only alive ones', async () => {
    const { findPodForWorkspace } = await import('../../src/kube/exec.js');
    const { getCoreV1Api, getNamespace } = await import('../../src/kube/client.js');
    const { readAgentSessions, removeAgentSession } = await import('../../src/kube/annotations.js');
    const { getTerminalState } = await import('../../src/tools/get-terminal-state.js');

    vi.mocked(findPodForWorkspace).mockResolvedValue({ podName: 'ws-pod-1', containers: ['dev'] });
    vi.mocked(getNamespace).mockReturnValue('user-che');
    vi.mocked(getCoreV1Api).mockReturnValue({
      readNamespacedPod: vi.fn().mockResolvedValue({
        spec: { containers: [{ name: 'dev', resources: { limits: { memory: '8Gi', cpu: '4' } } }] },
      }),
    } as any);
    vi.mocked(readAgentSessions).mockResolvedValue([
      { session_id: 'alive-1', backend: 'claude-code', status: 'running', working_dir: '/projects', task: 't1', launched_at: '' },
      { session_id: 'dead-1', backend: 'claude-code', status: 'running', working_dir: '/projects', task: 't2', launched_at: '' },
      { session_id: 'alive-2', backend: 'opencode', status: 'running', working_dir: '/projects', task: 't3', launched_at: '' },
    ]);
    vi.mocked(getTerminalState).mockImplementation(async (params) => {
      if (params.session_name === 'dead-1') {
        return { session_alive: false, process_running: false, exit_code: 0 };
      }
      return { session_alive: true, process_running: true, exit_code: null };
    });
    vi.mocked(removeAgentSession).mockResolvedValue();

    const { getWorkspaceCapacity } = await import('../../src/tools/get-workspace-capacity.js');
    const result = await getWorkspaceCapacity({ workspace: 'my-ws' });

    expect((result as any).running_agents).toBe(2);
    expect((result as any).available_slots).toBe(2);

    // Wait for fire-and-forget removeAgentSession to settle
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(removeAgentSession).toHaveBeenCalledWith('my-ws', 'dead-1');
    expect(removeAgentSession).toHaveBeenCalledTimes(1);
  });

  it('counts session as alive when getTerminalState fails (conservative)', async () => {
    const { findPodForWorkspace } = await import('../../src/kube/exec.js');
    const { getCoreV1Api, getNamespace } = await import('../../src/kube/client.js');
    const { readAgentSessions } = await import('../../src/kube/annotations.js');
    const { getTerminalState } = await import('../../src/tools/get-terminal-state.js');

    vi.mocked(findPodForWorkspace).mockResolvedValue({ podName: 'ws-pod-1', containers: ['dev'] });
    vi.mocked(getNamespace).mockReturnValue('user-che');
    vi.mocked(getCoreV1Api).mockReturnValue({
      readNamespacedPod: vi.fn().mockResolvedValue({
        spec: { containers: [{ name: 'dev', resources: { limits: { memory: '8Gi', cpu: '4' } } }] },
      }),
    } as any);
    vi.mocked(readAgentSessions).mockResolvedValue([
      { session_id: 'a-1', backend: 'claude-code', status: 'running', working_dir: '/projects', task: 't1', launched_at: '' },
      { session_id: 'a-2', backend: 'opencode', status: 'running', working_dir: '/projects', task: 't2', launched_at: '' },
    ]);
    vi.mocked(getTerminalState)
      .mockResolvedValueOnce({ session_alive: true, process_running: true, exit_code: null })
      .mockRejectedValueOnce(new Error('exec failed'));

    const { getWorkspaceCapacity } = await import('../../src/tools/get-workspace-capacity.js');
    const result = await getWorkspaceCapacity({ workspace: 'my-ws' });

    // Both counted as alive: one confirmed alive, one failed check (conservative)
    expect((result as any).running_agents).toBe(2);
    expect((result as any).available_slots).toBe(2);
  });
});
