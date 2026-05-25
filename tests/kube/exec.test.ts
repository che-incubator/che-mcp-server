import { describe, it, expect, vi, beforeEach } from 'vitest';

import { CHE_GATEWAY_CONTAINER } from '../../src/types.js';

// Mock the client module so findPodForWorkspace can call getCoreV1Api/getNamespace
vi.mock('../../src/kube/client.js', () => ({
  getCoreV1Api: vi.fn(),
  getCustomObjectsApi: vi.fn(),
  getNamespace: vi.fn().mockReturnValue('test-namespace'),
  getKubeConfig: vi.fn(),
}));

describe('findPodForWorkspace', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('returns pod name and container list for a matching Running pod', async () => {
    const { getCoreV1Api, getNamespace } = await import(
      '../../src/kube/client.js'
    );

    const mockPodList = {
      items: [
        {
          metadata: { name: 'workspace-pod-abc123' },
          status: { phase: 'Running' },
          spec: {
            containers: [
              { name: 'dev-container' },
              { name: CHE_GATEWAY_CONTAINER },
            ],
          },
        },
      ],
    };

    vi.mocked(getCoreV1Api).mockReturnValue({
      listNamespacedPod: vi.fn().mockResolvedValue(mockPodList),
    } as any);
    vi.mocked(getNamespace).mockReturnValue('test-namespace');

    const { findPodForWorkspace } = await import('../../src/kube/exec.js');
    const result = await findPodForWorkspace('my-workspace');

    expect(result.podName).toBe('workspace-pod-abc123');
    expect(result.containers).toEqual(['dev-container', CHE_GATEWAY_CONTAINER]);

    const coreApi = getCoreV1Api();
    expect(coreApi.listNamespacedPod).toHaveBeenCalledWith({
      namespace: 'test-namespace',
      labelSelector: 'controller.devfile.io/devworkspace_name=my-workspace',
    });
  });

  it('throws WorkspaceNotReadyError with phase when no running pod found', async () => {
    const { getCoreV1Api, getCustomObjectsApi, getNamespace } = await import(
      '../../src/kube/client.js'
    );

    const mockPodList = {
      items: [
        {
          metadata: { name: 'workspace-pod-abc123' },
          status: { phase: 'Pending' },
          spec: {
            containers: [{ name: 'dev-container' }],
          },
        },
      ],
    };

    vi.mocked(getCoreV1Api).mockReturnValue({
      listNamespacedPod: vi.fn().mockResolvedValue(mockPodList),
    } as any);
    vi.mocked(getCustomObjectsApi).mockReturnValue({
      getNamespacedCustomObject: vi.fn().mockResolvedValue({
        status: { phase: 'Starting' },
      }),
    } as any);
    vi.mocked(getNamespace).mockReturnValue('test-namespace');

    const { findPodForWorkspace, WorkspaceNotReadyError } = await import(
      '../../src/kube/exec.js'
    );
    await expect(findPodForWorkspace('my-workspace')).rejects.toThrow(
      WorkspaceNotReadyError,
    );
    await expect(findPodForWorkspace('my-workspace')).rejects.toThrow(
      'is starting',
    );
  });

  it('throws with "not found" when workspace does not exist', async () => {
    const { getCoreV1Api, getCustomObjectsApi, getNamespace } = await import(
      '../../src/kube/client.js'
    );

    vi.mocked(getCoreV1Api).mockReturnValue({
      listNamespacedPod: vi.fn().mockResolvedValue({ items: [] }),
    } as any);
    vi.mocked(getCustomObjectsApi).mockReturnValue({
      getNamespacedCustomObject: vi
        .fn()
        .mockRejectedValue(new Error('not found')),
    } as any);
    vi.mocked(getNamespace).mockReturnValue('test-namespace');

    const { findPodForWorkspace } = await import('../../src/kube/exec.js');
    await expect(findPodForWorkspace('my-workspace')).rejects.toThrow(
      'not found',
    );
  });
});

describe('selectContainer', () => {
  it('picks first non-che-gateway container', async () => {
    const { selectContainer } = await import('../../src/kube/exec.js');
    const result = selectContainer([
      CHE_GATEWAY_CONTAINER,
      'dev-container',
      'sidecar',
    ]);
    expect(result).toBe('dev-container');
  });

  it('uses explicit container when provided', async () => {
    const { selectContainer } = await import('../../src/kube/exec.js');
    const result = selectContainer(['dev-container', 'sidecar'], 'sidecar');
    expect(result).toBe('sidecar');
  });

  it('throws when explicit container not found', async () => {
    const { selectContainer } = await import('../../src/kube/exec.js');
    expect(() =>
      selectContainer(['dev-container', 'sidecar'], 'missing'),
    ).toThrow(
      'Container "missing" not found. Available: dev-container, sidecar',
    );
  });

  it('throws when only che-gateway container exists', async () => {
    const { selectContainer } = await import('../../src/kube/exec.js');
    expect(() => selectContainer([CHE_GATEWAY_CONTAINER])).toThrow(
      'No dev container found in pod',
    );
  });
});
