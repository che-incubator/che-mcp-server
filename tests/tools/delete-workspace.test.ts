import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/kube/client.js');

describe('deleteWorkspace', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('deletes the DevWorkspace custom resource', async () => {
    const { getCustomObjectsApi, getNamespace } = await import(
      '../../src/kube/client.js'
    );
    const mockApi = {
      deleteNamespacedCustomObject: vi.fn().mockResolvedValue({}),
    };
    vi.mocked(getCustomObjectsApi).mockReturnValue(mockApi as any);
    vi.mocked(getNamespace).mockReturnValue('test-namespace');

    const { deleteWorkspace } = await import(
      '../../src/tools/delete-workspace.js'
    );
    const result = await deleteWorkspace({ workspace: 'my-workspace' });

    expect(result).toEqual({ name: 'my-workspace', deleted: true });
    expect(mockApi.deleteNamespacedCustomObject).toHaveBeenCalledWith({
      group: 'workspace.devfile.io',
      version: 'v1alpha2',
      namespace: 'test-namespace',
      plural: 'devworkspaces',
      name: 'my-workspace',
    });
  });
});
