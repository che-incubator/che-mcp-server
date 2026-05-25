import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/kube/client.js');

describe('getWorkspaceStatus', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns workspace status details from the DevWorkspace CR', async () => {
    const { getCustomObjectsApi, getNamespace } = await import(
      '../../src/kube/client.js'
    );
    const mockApi = {
      getNamespacedCustomObject: vi.fn().mockResolvedValue({
        metadata: {
          name: 'my-workspace',
          creationTimestamp: '2026-04-01T12:00:00Z',
          annotations: { 'che.eclipse.org/agent-session': 'active' },
          labels: { app: 'che' },
        },
        spec: {
          started: true,
        },
        status: {
          phase: 'Running',
          devworkspaceId: 'workspace-abc123',
          mainUrl: 'https://my-workspace.example.com',
          conditions: [
            {
              type: 'Ready',
              status: 'True',
              reason: 'AllGood',
              message: 'Workspace is ready',
            },
          ],
        },
      }),
    };
    vi.mocked(getCustomObjectsApi).mockReturnValue(mockApi as any);
    vi.mocked(getNamespace).mockReturnValue('test-namespace');

    const { getWorkspaceStatus } = await import(
      '../../src/tools/get-workspace-status.js'
    );
    const result = await getWorkspaceStatus({ workspace: 'my-workspace' });

    expect(result).toEqual({
      name: 'my-workspace',
      phase: 'Running',
      devworkspaceId: 'workspace-abc123',
      mainUrl: 'https://my-workspace.example.com',
      started: true,
      createdAt: '2026-04-01T12:00:00Z',
      conditions: [
        {
          type: 'Ready',
          status: 'True',
          reason: 'AllGood',
          message: 'Workspace is ready',
        },
      ],
      annotations: { 'che.eclipse.org/agent-session': 'active' },
      labels: { app: 'che' },
    });
    expect(mockApi.getNamespacedCustomObject).toHaveBeenCalledWith({
      group: 'workspace.devfile.io',
      version: 'v1alpha2',
      namespace: 'test-namespace',
      plural: 'devworkspaces',
      name: 'my-workspace',
    });
  });

  it('returns defaults for missing optional fields', async () => {
    const { getCustomObjectsApi, getNamespace } = await import(
      '../../src/kube/client.js'
    );
    const mockApi = {
      getNamespacedCustomObject: vi.fn().mockResolvedValue({
        metadata: {
          name: 'minimal-workspace',
        },
        spec: {},
        status: {
          phase: 'Starting',
        },
      }),
    };
    vi.mocked(getCustomObjectsApi).mockReturnValue(mockApi as any);
    vi.mocked(getNamespace).mockReturnValue('test-namespace');

    const { getWorkspaceStatus } = await import(
      '../../src/tools/get-workspace-status.js'
    );
    const result = await getWorkspaceStatus({ workspace: 'minimal-workspace' });

    expect(result).toEqual({
      name: 'minimal-workspace',
      phase: 'Starting',
      devworkspaceId: '',
      mainUrl: '',
      started: false,
      createdAt: '',
      conditions: [],
      annotations: {},
      labels: {},
    });
  });
});
