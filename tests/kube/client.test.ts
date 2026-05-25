import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@kubernetes/client-node');
vi.mock('node:child_process');
vi.mock('node:fs');

describe('KubeClient', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.CHE_MCP_NAMESPACE;
  });

  it('resolves namespace from kubeconfig context', async () => {
    const { KubeConfig } = await import('@kubernetes/client-node');
    const mockKc = {
      loadFromDefault: vi.fn(),
      getCurrentContext: vi.fn().mockReturnValue('test-context'),
      getContextObject: vi
        .fn()
        .mockReturnValue({ namespace: 'user-namespace' }),
      makeApiClient: vi.fn().mockReturnValue({}),
    };
    vi.mocked(KubeConfig).mockImplementation(function () {
      return mockKc as any;
    });

    const { getNamespace, initKubeClient } = await import(
      '../../src/kube/client.js'
    );
    await initKubeClient();
    expect(getNamespace()).toBe('user-namespace');
  });

  it('falls back to CHE_MCP_NAMESPACE env var', async () => {
    process.env.CHE_MCP_NAMESPACE = 'env-namespace';
    const { KubeConfig } = await import('@kubernetes/client-node');
    const mockKc = {
      loadFromDefault: vi.fn(),
      getCurrentContext: vi.fn().mockReturnValue('test-context'),
      getContextObject: vi.fn().mockReturnValue({}),
      makeApiClient: vi.fn().mockReturnValue({}),
    };
    vi.mocked(KubeConfig).mockImplementation(function () {
      return mockKc as any;
    });

    const { getNamespace, initKubeClient } = await import(
      '../../src/kube/client.js'
    );
    await initKubeClient();
    expect(getNamespace()).toBe('env-namespace');
  });

  it('detects namespace via oc whoami with -che suffix', async () => {
    const { KubeConfig } = await import('@kubernetes/client-node');
    const { execFileSync } = await import('node:child_process');
    const mockReadNamespace = vi.fn().mockResolvedValueOnce({});
    const mockKc = {
      loadFromDefault: vi.fn(),
      getCurrentContext: vi.fn().mockReturnValue('test-context'),
      getContextObject: vi.fn().mockReturnValue({}),
      makeApiClient: vi
        .fn()
        .mockReturnValue({ readNamespace: mockReadNamespace }),
    };
    vi.mocked(KubeConfig).mockImplementation(function () {
      return mockKc as any;
    });
    vi.mocked(execFileSync).mockReturnValue('testuser\n');

    const { getNamespace, initKubeClient } = await import(
      '../../src/kube/client.js'
    );
    await initKubeClient();
    expect(getNamespace()).toBe('testuser-che');
    expect(mockReadNamespace).toHaveBeenCalledWith({ name: 'testuser-che' });
  });

  it('detects namespace via oc whoami with -devspaces suffix', async () => {
    const { KubeConfig } = await import('@kubernetes/client-node');
    const { execFileSync } = await import('node:child_process');
    const mockReadNamespace = vi
      .fn()
      .mockRejectedValueOnce(new Error('not found'))
      .mockResolvedValueOnce({});
    const mockKc = {
      loadFromDefault: vi.fn(),
      getCurrentContext: vi.fn().mockReturnValue('test-context'),
      getContextObject: vi.fn().mockReturnValue({}),
      makeApiClient: vi
        .fn()
        .mockReturnValue({ readNamespace: mockReadNamespace }),
    };
    vi.mocked(KubeConfig).mockImplementation(function () {
      return mockKc as any;
    });
    vi.mocked(execFileSync).mockReturnValue('testuser\n');

    const { getNamespace, initKubeClient } = await import(
      '../../src/kube/client.js'
    );
    await initKubeClient();
    expect(getNamespace()).toBe('testuser-devspaces');
    expect(mockReadNamespace).toHaveBeenCalledTimes(2);
  });

  it('throws when oc whoami fails and no other source available', async () => {
    const { KubeConfig } = await import('@kubernetes/client-node');
    const { execFileSync } = await import('node:child_process');
    const mockKc = {
      loadFromDefault: vi.fn(),
      getCurrentContext: vi.fn().mockReturnValue('test-context'),
      getContextObject: vi.fn().mockReturnValue({}),
      makeApiClient: vi.fn().mockReturnValue({}),
    };
    vi.mocked(KubeConfig).mockImplementation(function () {
      return mockKc as any;
    });
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('command not found');
    });

    const { initKubeClient } = await import('../../src/kube/client.js');
    await expect(initKubeClient()).rejects.toThrow('namespace');
  });

  it('throws when neither namespace exists on cluster', async () => {
    const { KubeConfig } = await import('@kubernetes/client-node');
    const { execFileSync } = await import('node:child_process');
    const mockReadNamespace = vi.fn().mockRejectedValue(new Error('not found'));
    const mockKc = {
      loadFromDefault: vi.fn(),
      getCurrentContext: vi.fn().mockReturnValue('test-context'),
      getContextObject: vi.fn().mockReturnValue({}),
      makeApiClient: vi
        .fn()
        .mockReturnValue({ readNamespace: mockReadNamespace }),
    };
    vi.mocked(KubeConfig).mockImplementation(function () {
      return mockKc as any;
    });
    vi.mocked(execFileSync).mockReturnValue('testuser\n');

    const { initKubeClient } = await import('../../src/kube/client.js');
    await expect(initKubeClient()).rejects.toThrow('namespace');
  });

  it('throws when kubeconfig cannot be loaded', async () => {
    const { KubeConfig } = await import('@kubernetes/client-node');
    const mockKc = {
      loadFromDefault: vi.fn().mockImplementation(() => {
        throw new Error('ENOENT: no such file');
      }),
    };
    vi.mocked(KubeConfig).mockImplementation(function () {
      return mockKc as any;
    });

    const { initKubeClient } = await import('../../src/kube/client.js');
    await expect(initKubeClient()).rejects.toThrow();
  });

  it('reads namespace from SA mounted file', async () => {
    const { KubeConfig } = await import('@kubernetes/client-node');
    const { readFileSync } = await import('node:fs');
    const mockKc = {
      loadFromDefault: vi.fn(),
      getCurrentContext: vi.fn().mockReturnValue('test-context'),
      getContextObject: vi.fn().mockReturnValue({}),
      makeApiClient: vi.fn().mockReturnValue({}),
    };
    vi.mocked(KubeConfig).mockImplementation(function () {
      return mockKc as any;
    });
    vi.mocked(readFileSync).mockReturnValue('sa-namespace');

    const { getNamespace, initKubeClient } = await import(
      '../../src/kube/client.js'
    );
    await initKubeClient();
    expect(getNamespace()).toBe('sa-namespace');
  });
});
