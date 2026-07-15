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

  it('creates a workspace with repo_url and projects entry', async () => {
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
      repo_url: 'https://github.com/org/my-app.git',
    });

    expect(result).toEqual({
      name: 'my-workspace',
      started: true,
      tools_injected: [],
    });

    const body = mockApi.createNamespacedCustomObject.mock.calls[0][0].body;
    expect(body.spec.template.projects).toEqual([
      {
        name: 'my-app',
        git: {
          remotes: { origin: 'https://github.com/org/my-app.git' },
        },
      },
    ]);
  });

  it('creates a workspace with repo_url and branch', async () => {
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
      repo_url: 'https://github.com/org/my-app',
      branch: 'feature-branch',
    });

    const body = mockApi.createNamespacedCustomObject.mock.calls[0][0].body;
    expect(body.spec.template.projects).toEqual([
      {
        name: 'my-app',
        git: {
          remotes: { origin: 'https://github.com/org/my-app' },
          checkoutFrom: { revision: 'feature-branch' },
        },
      },
    ]);
  });

  it('creates a workspace with post_start_command', async () => {
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
      post_start_command: 'npm install',
    });

    expect(result).toEqual({
      name: 'my-workspace',
      started: true,
      tools_injected: [],
    });

    const body = mockApi.createNamespacedCustomObject.mock.calls[0][0].body;
    expect(body.spec.template.commands).toEqual([
      {
        id: 'post-start',
        exec: { component: 'dev', commandLine: 'npm install' },
      },
    ]);
    expect(body.spec.template.events).toEqual({
      postStart: ['post-start'],
    });
  });

  it('does not add commands or events when post_start_command is omitted', async () => {
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

    const body = mockApi.createNamespacedCustomObject.mock.calls[0][0].body;
    expect(body.spec.template.commands).toBeUndefined();
    expect(body.spec.template.events).toBeUndefined();
  });

  it('throws when branch is provided without repo_url', async () => {
    const { createWorkspace } = await import(
      '../../src/tools/create-workspace.js'
    );

    await expect(
      createWorkspace({ branch: 'main' }),
    ).rejects.toThrow('branch requires repo_url');
  });

  it('derives project name from repo_url correctly', async () => {
    const { getCustomObjectsApi, getNamespace } = await import(
      '../../src/kube/client.js'
    );
    const mockApi = {
      createNamespacedCustomObject: vi.fn().mockResolvedValue({
        metadata: { name: 'ws' },
      }),
      patchNamespacedCustomObject: vi.fn().mockResolvedValue({}),
    };
    vi.mocked(getCustomObjectsApi).mockReturnValue(mockApi as any);
    vi.mocked(getNamespace).mockReturnValue('test-namespace');

    const { createWorkspace } = await import(
      '../../src/tools/create-workspace.js'
    );

    // Trailing slash
    await createWorkspace({ name: 'ws', repo_url: 'https://github.com/org/trailing/' });
    let body = mockApi.createNamespacedCustomObject.mock.calls[0][0].body;
    expect(body.spec.template.projects[0].name).toBe('trailing');

    // Nested path with .git
    mockApi.createNamespacedCustomObject.mockResolvedValue({ metadata: { name: 'ws' } });
    await createWorkspace({ name: 'ws', repo_url: 'https://gitlab.com/group/sub/repo.git' });
    body = mockApi.createNamespacedCustomObject.mock.calls[1][0].body;
    expect(body.spec.template.projects[0].name).toBe('repo');
  });

  it('creates a workspace with both tools and post_start_command', async () => {
    const { getCustomObjectsApi, getNamespace } = await import(
      '../../src/kube/client.js'
    );
    const mockApi = {
      createNamespacedCustomObject: vi.fn().mockResolvedValue({
        metadata: { name: 'my-workspace' },
      }),
      getNamespacedCustomObject: vi.fn().mockResolvedValue({
        spec: {
          template: {
            commands: [
              {
                id: 'post-start',
                exec: { component: 'dev', commandLine: 'npm install' },
              },
            ],
            events: { postStart: ['post-start'] },
          },
        },
        metadata: {},
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
      tools: ['opencode'],
      post_start_command: 'npm install',
    });

    expect(result).toEqual({
      name: 'my-workspace',
      started: true,
      tools_injected: ['opencode'],
    });

    const body = mockApi.createNamespacedCustomObject.mock.calls[0][0].body;
    expect(body.spec.template.commands).toEqual([
      {
        id: 'post-start',
        exec: { component: 'dev', commandLine: 'npm install' },
      },
    ]);
    expect(body.spec.template.events).toEqual({
      postStart: ['post-start'],
    });
  });

  describe('deriveProjectName', () => {
    it('lowercases uppercase letters', async () => {
      const { deriveProjectName } = await import('../../src/tools/create-workspace.js');
      expect(deriveProjectName('https://github.com/org/MyApp.git')).toBe('myapp');
    });

    it('replaces underscores and dots with hyphens', async () => {
      const { deriveProjectName } = await import('../../src/tools/create-workspace.js');
      expect(deriveProjectName('https://github.com/org/my_cool.app')).toBe('my-cool-app');
    });

    it('collapses consecutive hyphens', async () => {
      const { deriveProjectName } = await import('../../src/tools/create-workspace.js');
      expect(deriveProjectName('https://github.com/org/a--b__c..d')).toBe('a-b-c-d');
    });

    it('strips leading and trailing hyphens', async () => {
      const { deriveProjectName } = await import('../../src/tools/create-workspace.js');
      expect(deriveProjectName('https://github.com/org/-my-app-.git')).toBe('my-app');
    });

    it('truncates to 63 characters without trailing hyphen', async () => {
      const { deriveProjectName } = await import('../../src/tools/create-workspace.js');
      const long = 'a'.repeat(70);
      const result = deriveProjectName(`https://github.com/org/${long}`);
      expect(result.length).toBeLessThanOrEqual(63);
      expect(result).toMatch(/[a-z0-9]$/);
    });

    it('falls back to "project" when name is empty after sanitization', async () => {
      const { deriveProjectName } = await import('../../src/tools/create-workspace.js');
      expect(deriveProjectName('https://github.com/org/---.git')).toBe('project');
    });
  });
});
