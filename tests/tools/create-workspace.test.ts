import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/kube/client.js');

describe('createWorkspace', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('creates a workspace with explicit name', async () => {
    const { getCustomObjectsApi, getNamespace } = await import(
      '../../src/kube/client.js'
    );
    const mockApi = {
      createNamespacedCustomObject: vi.fn().mockResolvedValue({
        metadata: { name: 'my-workspace' },
      }),
      patchNamespacedCustomObject: vi.fn().mockResolvedValue({}),
    };
    vi.mocked(getCustomObjectsApi).mockReturnValue(mockApi as any);
    vi.mocked(getNamespace).mockReturnValue('test-namespace');

    const { createWorkspace } = await import(
      '../../src/tools/create-workspace.js'
    );
    const result = await createWorkspace({ name: 'my-workspace' });

    expect(result).toEqual({
      name: 'my-workspace',
      started: true,
      tools_injected: [],
    });
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
    const { getCustomObjectsApi, getNamespace } = await import(
      '../../src/kube/client.js'
    );
    const mockApi = {
      createNamespacedCustomObject: vi.fn().mockResolvedValue({
        metadata: { name: 'empty-abc12' },
      }),
      patchNamespacedCustomObject: vi.fn().mockResolvedValue({}),
    };
    vi.mocked(getCustomObjectsApi).mockReturnValue(mockApi as any);
    vi.mocked(getNamespace).mockReturnValue('test-namespace');

    const { createWorkspace } = await import(
      '../../src/tools/create-workspace.js'
    );
    const result = await createWorkspace({});

    expect(result).toEqual({
      name: 'empty-abc12',
      started: true,
      tools_injected: [],
    });
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

  it('creates a workspace with repos parameter', async () => {
    const { getCustomObjectsApi, getNamespace } = await import(
      '../../src/kube/client.js'
    );
    const mockApi = {
      createNamespacedCustomObject: vi.fn().mockResolvedValue({
        metadata: { name: 'my-workspace' },
      }),
      patchNamespacedCustomObject: vi.fn().mockResolvedValue({}),
    };
    vi.mocked(getCustomObjectsApi).mockReturnValue(mockApi as any);
    vi.mocked(getNamespace).mockReturnValue('test-namespace');

    const { createWorkspace } = await import(
      '../../src/tools/create-workspace.js'
    );
    const result = await createWorkspace({
      name: 'my-workspace',
      repos: [{ url: 'https://github.com/eclipse-che/che-server' }],
    });

    expect(result).toEqual({
      name: 'my-workspace',
      started: true,
      tools_injected: [],
    });

    const createCall = mockApi.createNamespacedCustomObject.mock.calls[0][0];
    expect(createCall.body.spec.template.projects).toEqual([
      {
        name: 'che-server',
        git: {
          remotes: { origin: 'https://github.com/eclipse-che/che-server' },
          checkoutFrom: undefined,
        },
      },
    ]);
  });

  it('creates a workspace without projects array when repos is undefined', async () => {
    const { getCustomObjectsApi, getNamespace } = await import(
      '../../src/kube/client.js'
    );
    const mockApi = {
      createNamespacedCustomObject: vi.fn().mockResolvedValue({
        metadata: { name: 'my-workspace' },
      }),
      patchNamespacedCustomObject: vi.fn().mockResolvedValue({}),
    };
    vi.mocked(getCustomObjectsApi).mockReturnValue(mockApi as any);
    vi.mocked(getNamespace).mockReturnValue('test-namespace');

    const { createWorkspace } = await import(
      '../../src/tools/create-workspace.js'
    );
    await createWorkspace({ name: 'my-workspace' });

    const createCall = mockApi.createNamespacedCustomObject.mock.calls[0][0];
    expect(createCall.body.spec.template.projects).toBeUndefined();
  });

  it('creates a workspace without projects array when repos is empty', async () => {
    const { getCustomObjectsApi, getNamespace } = await import(
      '../../src/kube/client.js'
    );
    const mockApi = {
      createNamespacedCustomObject: vi.fn().mockResolvedValue({
        metadata: { name: 'my-workspace' },
      }),
      patchNamespacedCustomObject: vi.fn().mockResolvedValue({}),
    };
    vi.mocked(getCustomObjectsApi).mockReturnValue(mockApi as any);
    vi.mocked(getNamespace).mockReturnValue('test-namespace');

    const { createWorkspace } = await import(
      '../../src/tools/create-workspace.js'
    );
    await createWorkspace({ name: 'my-workspace', repos: [] });

    const createCall = mockApi.createNamespacedCustomObject.mock.calls[0][0];
    expect(createCall.body.spec.template.projects).toEqual([]);
  });

  it('includes branch in checkoutFrom when specified', async () => {
    const { getCustomObjectsApi, getNamespace } = await import(
      '../../src/kube/client.js'
    );
    const mockApi = {
      createNamespacedCustomObject: vi.fn().mockResolvedValue({
        metadata: { name: 'my-workspace' },
      }),
      patchNamespacedCustomObject: vi.fn().mockResolvedValue({}),
    };
    vi.mocked(getCustomObjectsApi).mockReturnValue(mockApi as any);
    vi.mocked(getNamespace).mockReturnValue('test-namespace');

    const { createWorkspace } = await import(
      '../../src/tools/create-workspace.js'
    );
    await createWorkspace({
      name: 'my-workspace',
      repos: [
        { url: 'https://github.com/eclipse-che/che-server', branch: 'main' },
      ],
    });

    const createCall = mockApi.createNamespacedCustomObject.mock.calls[0][0];
    expect(createCall.body.spec.template.projects[0].git.checkoutFrom).toEqual(
      { revision: 'main' }
    );
  });

  it('excludes checkoutFrom when branch is not specified', async () => {
    const { getCustomObjectsApi, getNamespace } = await import(
      '../../src/kube/client.js'
    );
    const mockApi = {
      createNamespacedCustomObject: vi.fn().mockResolvedValue({
        metadata: { name: 'my-workspace' },
      }),
      patchNamespacedCustomObject: vi.fn().mockResolvedValue({}),
    };
    vi.mocked(getCustomObjectsApi).mockReturnValue(mockApi as any);
    vi.mocked(getNamespace).mockReturnValue('test-namespace');

    const { createWorkspace } = await import(
      '../../src/tools/create-workspace.js'
    );
    await createWorkspace({
      name: 'my-workspace',
      repos: [{ url: 'https://github.com/eclipse-che/che-server' }],
    });

    const createCall = mockApi.createNamespacedCustomObject.mock.calls[0][0];
    expect(createCall.body.spec.template.projects[0].git.checkoutFrom).toBeUndefined();
  });

  it('handles multiple repos correctly', async () => {
    const { getCustomObjectsApi, getNamespace } = await import(
      '../../src/kube/client.js'
    );
    const mockApi = {
      createNamespacedCustomObject: vi.fn().mockResolvedValue({
        metadata: { name: 'my-workspace' },
      }),
      patchNamespacedCustomObject: vi.fn().mockResolvedValue({}),
    };
    vi.mocked(getCustomObjectsApi).mockReturnValue(mockApi as any);
    vi.mocked(getNamespace).mockReturnValue('test-namespace');

    const { createWorkspace } = await import(
      '../../src/tools/create-workspace.js'
    );
    await createWorkspace({
      name: 'my-workspace',
      repos: [
        { url: 'https://github.com/eclipse-che/che-server', branch: 'main' },
        { url: 'https://gitlab.com/eclipse/che-dashboard' },
      ],
    });

    const createCall = mockApi.createNamespacedCustomObject.mock.calls[0][0];
    expect(createCall.body.spec.template.projects).toEqual([
      {
        name: 'che-server',
        git: {
          remotes: { origin: 'https://github.com/eclipse-che/che-server' },
          checkoutFrom: { revision: 'main' },
        },
      },
      {
        name: 'che-dashboard',
        git: {
          remotes: { origin: 'https://gitlab.com/eclipse/che-dashboard' },
          checkoutFrom: undefined,
        },
      },
    ]);
  });

  describe('extractRepoName', () => {
    it('extracts repo name from GitHub URL', async () => {
      const { extractRepoName } = await import(
        '../../src/tools/create-workspace.js'
      );
      expect(extractRepoName('https://github.com/org/repo')).toBe('repo');
    });

    it('extracts repo name from GitHub URL with .git suffix', async () => {
      const { extractRepoName } = await import(
        '../../src/tools/create-workspace.js'
      );
      expect(extractRepoName('https://github.com/org/repo.git')).toBe('repo');
    });

    it('extracts repo name from GitLab URL', async () => {
      const { extractRepoName } = await import(
        '../../src/tools/create-workspace.js'
      );
      expect(extractRepoName('https://gitlab.com/group/project')).toBe('project');
    });

    it('extracts repo name from GitLab URL with .git suffix', async () => {
      const { extractRepoName } = await import(
        '../../src/tools/create-workspace.js'
      );
      expect(extractRepoName('https://gitlab.com/group/project.git')).toBe(
        'project'
      );
    });

    it('returns fallback for malformed URL', async () => {
      const { extractRepoName } = await import(
        '../../src/tools/create-workspace.js'
      );
      expect(extractRepoName('malformed')).toBe('project');
    });
  });
});
