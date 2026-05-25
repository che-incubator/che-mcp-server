import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/kube/client.js');

describe('startWorkspace', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('patches workspace to started: true', async () => {
    const { getCustomObjectsApi, getNamespace } = await import(
      '../../src/kube/client.js'
    );
    const mockApi = {
      patchNamespacedCustomObject: vi.fn().mockResolvedValue({}),
    };
    vi.mocked(getCustomObjectsApi).mockReturnValue(mockApi as any);
    vi.mocked(getNamespace).mockReturnValue('test-namespace');

    const { startWorkspace } = await import(
      '../../src/tools/start-workspace.js'
    );
    const result = await startWorkspace({ workspace: 'my-workspace' });

    expect(result).toEqual({ name: 'my-workspace', started: true });
    expect(mockApi.patchNamespacedCustomObject).toHaveBeenCalledWith({
      group: 'workspace.devfile.io',
      version: 'v1alpha2',
      namespace: 'test-namespace',
      plural: 'devworkspaces',
      name: 'my-workspace',
      body: [{ op: 'replace', path: '/spec/started', value: true }],
    });
  });
});
