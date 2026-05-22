import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/kube/client.js');

describe('createWorkspace', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('creates a workspace with explicit name', async () => {
    const { getCustomObjectsApi, getNamespace } = await import('../../src/kube/client.js');
    const mockApi = {
      createNamespacedCustomObject: vi.fn().mockResolvedValue({
        metadata: { name: 'my-workspace' },
      }),
      patchNamespacedCustomObject: vi.fn().mockResolvedValue({}),
    };
    vi.mocked(getCustomObjectsApi).mockReturnValue(mockApi as any);
    vi.mocked(getNamespace).mockReturnValue('test-namespace');

    const { createWorkspace } = await import('../../src/tools/create-workspace.js');
    const result = await createWorkspace({ name: 'my-workspace' });

    expect(result).toEqual({ name: 'my-workspace', started: true, tools_injected: [] });
    expect(mockApi.createNamespacedCustomObject).toHaveBeenCalledWith({
      group: 'workspace.devfile.io',
      version: 'v1alpha2',
      namespace: 'test-namespace',
      plural: 'devworkspaces',
      body: {
        apiVersion: 'workspace.devfile.io/v1alpha2',
        kind: 'DevWorkspace',
        metadata: { name: 'my-workspace' },
        spec: {
          started: false,
          template: {
            components: [
              {
                name: 'dev',
                container: {
                  image: 'quay.io/che-incubator/agent-base-image:latest',
                  memoryLimit: '8Gi',
                  memoryRequest: '1Gi',
                  cpuRequest: '500m',
                  cpuLimit: '2000m',
                  endpoints: [
                    {
                      name: 'ttyd-terminal',
                      targetPort: 7681,
                      exposure: 'public',
                      protocol: 'https',
                      attributes: {
                        type: 'main',
                        cookiesAuthEnabled: true,
                        discoverable: false,
                        urlRewriteSupported: true,
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    });
    expect(mockApi.patchNamespacedCustomObject).toHaveBeenCalledWith({
      group: 'workspace.devfile.io',
      version: 'v1alpha2',
      namespace: 'test-namespace',
      plural: 'devworkspaces',
      name: 'my-workspace',
      body: [{ op: 'replace', path: '/spec/started', value: true }],
    });
  });

  it('creates a workspace with generateName when name is omitted', async () => {
    const { getCustomObjectsApi, getNamespace } = await import('../../src/kube/client.js');
    const mockApi = {
      createNamespacedCustomObject: vi.fn().mockResolvedValue({
        metadata: { name: 'empty-abc12' },
      }),
      patchNamespacedCustomObject: vi.fn().mockResolvedValue({}),
    };
    vi.mocked(getCustomObjectsApi).mockReturnValue(mockApi as any);
    vi.mocked(getNamespace).mockReturnValue('test-namespace');

    const { createWorkspace } = await import('../../src/tools/create-workspace.js');
    const result = await createWorkspace({});

    expect(result).toEqual({ name: 'empty-abc12', started: true, tools_injected: [] });
    expect(mockApi.createNamespacedCustomObject).toHaveBeenCalledWith({
      group: 'workspace.devfile.io',
      version: 'v1alpha2',
      namespace: 'test-namespace',
      plural: 'devworkspaces',
      body: {
        apiVersion: 'workspace.devfile.io/v1alpha2',
        kind: 'DevWorkspace',
        metadata: { generateName: 'empty-' },
        spec: {
          started: false,
          template: {
            components: [
              {
                name: 'dev',
                container: {
                  image: 'quay.io/che-incubator/agent-base-image:latest',
                  memoryLimit: '8Gi',
                  memoryRequest: '1Gi',
                  cpuRequest: '500m',
                  cpuLimit: '2000m',
                  endpoints: [
                    {
                      name: 'ttyd-terminal',
                      targetPort: 7681,
                      exposure: 'public',
                      protocol: 'https',
                      attributes: {
                        type: 'main',
                        cookiesAuthEnabled: true,
                        discoverable: false,
                        urlRewriteSupported: true,
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    });
    expect(mockApi.patchNamespacedCustomObject).toHaveBeenCalledWith({
      group: 'workspace.devfile.io',
      version: 'v1alpha2',
      namespace: 'test-namespace',
      plural: 'devworkspaces',
      name: 'empty-abc12',
      body: [{ op: 'replace', path: '/spec/started', value: true }],
    });
  });
});
