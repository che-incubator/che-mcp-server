import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/kube/client.js');

describe('stopWorkspace', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('patches workspace to started: false', async () => {
    const { getCustomObjectsApi, getNamespace } = await import(
      '../../src/kube/client.js'
    );
    const mockApi = {
      patchNamespacedCustomObject: vi.fn().mockResolvedValue({}),
    };
    vi.mocked(getCustomObjectsApi).mockReturnValue(mockApi as any);
    vi.mocked(getNamespace).mockReturnValue('test-namespace');

    const { stopWorkspace } = await import('../../src/tools/stop-workspace.js');
    const result = await stopWorkspace({ workspace: 'my-workspace' });

    expect(result).toEqual({ name: 'my-workspace', started: false });
    expect(mockApi.patchNamespacedCustomObject).toHaveBeenCalledWith({
      group: 'workspace.devfile.io',
      version: 'v1alpha2',
      namespace: 'test-namespace',
      plural: 'devworkspaces',
      name: 'my-workspace',
      body: [{ op: 'replace', path: '/spec/started', value: false }],
    });
  });
});
