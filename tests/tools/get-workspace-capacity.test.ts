import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/kube/client.js');
vi.mock('../../src/kube/exec.js');
vi.mock('../../src/kube/annotations.js');

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

  it('subtracts running agents from available slots', async () => {
    const { findPodForWorkspace } = await import('../../src/kube/exec.js');
    const { getCoreV1Api, getNamespace } = await import('../../src/kube/client.js');
    const { readAgentSessions } = await import('../../src/kube/annotations.js');

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

    const { getWorkspaceCapacity } = await import('../../src/tools/get-workspace-capacity.js');
    const result = await getWorkspaceCapacity({ workspace: 'my-ws' });

    expect((result as any).running_agents).toBe(2);
    expect((result as any).available_slots).toBe(2);
  });

  it('available_slots is never negative', async () => {
    const { findPodForWorkspace } = await import('../../src/kube/exec.js');
    const { getCoreV1Api, getNamespace } = await import('../../src/kube/client.js');
    const { readAgentSessions } = await import('../../src/kube/annotations.js');

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

    const { getWorkspaceCapacity } = await import('../../src/tools/get-workspace-capacity.js');
    const result = await getWorkspaceCapacity({ workspace: 'my-ws' });

    expect((result as any).available_slots).toBe(0);
  });
});
