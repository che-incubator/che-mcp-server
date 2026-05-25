import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/kube/client.js');
vi.mock('../../src/kube/exec.js');

describe('getWorkspacePod', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns pod details with container statuses', async () => {
    const { getCoreV1Api, getNamespace } = await import(
      '../../src/kube/client.js'
    );
    const { findPodForWorkspace } = await import('../../src/kube/exec.js');

    vi.mocked(findPodForWorkspace).mockResolvedValue({
      podName: 'workspace-abc123-pod',
      containers: ['dev-container', 'che-gateway'],
    });

    const mockCoreApi = {
      readNamespacedPod: vi.fn().mockResolvedValue({
        status: {
          phase: 'Running',
          containerStatuses: [
            { name: 'dev-container', ready: true, restartCount: 0 },
            { name: 'che-gateway', ready: true, restartCount: 1 },
          ],
        },
      }),
    };
    vi.mocked(getCoreV1Api).mockReturnValue(mockCoreApi as any);
    vi.mocked(getNamespace).mockReturnValue('test-namespace');

    const { getWorkspacePod } = await import(
      '../../src/tools/get-workspace-pod.js'
    );
    const result = await getWorkspacePod({ workspace: 'my-workspace' });

    expect(result).toEqual({
      workspace: 'my-workspace',
      podName: 'workspace-abc123-pod',
      phase: 'Running',
      containers: [
        { name: 'dev-container', ready: true, restartCount: 0 },
        { name: 'che-gateway', ready: true, restartCount: 1 },
      ],
    });
    expect(findPodForWorkspace).toHaveBeenCalledWith('my-workspace');
    expect(mockCoreApi.readNamespacedPod).toHaveBeenCalledWith({
      name: 'workspace-abc123-pod',
      namespace: 'test-namespace',
    });
  });

  it('returns empty containers when containerStatuses is missing', async () => {
    const { getCoreV1Api, getNamespace } = await import(
      '../../src/kube/client.js'
    );
    const { findPodForWorkspace } = await import('../../src/kube/exec.js');

    vi.mocked(findPodForWorkspace).mockResolvedValue({
      podName: 'workspace-xyz-pod',
      containers: ['dev-container'],
    });

    const mockCoreApi = {
      readNamespacedPod: vi.fn().mockResolvedValue({
        status: {
          phase: 'Pending',
        },
      }),
    };
    vi.mocked(getCoreV1Api).mockReturnValue(mockCoreApi as any);
    vi.mocked(getNamespace).mockReturnValue('test-namespace');

    const { getWorkspacePod } = await import(
      '../../src/tools/get-workspace-pod.js'
    );
    const result = await getWorkspacePod({ workspace: 'my-workspace' });

    expect(result).toEqual({
      workspace: 'my-workspace',
      podName: 'workspace-xyz-pod',
      phase: 'Pending',
      containers: [],
    });
  });
});
