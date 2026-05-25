import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WorkspaceInfo } from '../../src/types.js';

vi.mock('../../src/kube/client.js');

describe('listWorkspaces', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns workspace name, phase, url, and filtered annotations', async () => {
    const { getCustomObjectsApi, getNamespace } = await import(
      '../../src/kube/client.js'
    );
    const mockApi = {
      listNamespacedCustomObject: vi.fn().mockResolvedValue({
        items: [
          {
            metadata: {
              name: 'workspace-1',
              annotations: {
                'che.eclipse.org/agent-session': 'active',
                'che.eclipse.org/agent-pid': '12345',
                'other.annotation/key': 'should-be-filtered',
              },
            },
            status: {
              phase: 'Running',
              mainUrl: 'https://workspace-1.example.com',
            },
          },
        ],
      }),
    };
    vi.mocked(getCustomObjectsApi).mockReturnValue(mockApi as any);
    vi.mocked(getNamespace).mockReturnValue('test-namespace');

    const { listWorkspaces } = await import(
      '../../src/tools/list-workspaces.js'
    );
    const result = await listWorkspaces();

    expect(result.total).toBe(1);
    expect(result.count).toBe(1);
    expect(result.offset).toBe(0);
    expect(result.has_more).toBe(false);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual<WorkspaceInfo>({
      name: 'workspace-1',
      phase: 'Running',
      url: 'https://workspace-1.example.com',
      annotations: {
        'che.eclipse.org/agent-session': 'active',
        'che.eclipse.org/agent-pid': '12345',
      },
    });
  });

  it('returns empty url when workspace status has no mainUrl', async () => {
    const { getCustomObjectsApi, getNamespace } = await import(
      '../../src/kube/client.js'
    );
    const mockApi = {
      listNamespacedCustomObject: vi.fn().mockResolvedValue({
        items: [
          {
            metadata: {
              name: 'workspace-2',
              annotations: {},
            },
            status: {
              phase: 'Starting',
            },
          },
        ],
      }),
    };
    vi.mocked(getCustomObjectsApi).mockReturnValue(mockApi as any);
    vi.mocked(getNamespace).mockReturnValue('test-namespace');

    const { listWorkspaces } = await import(
      '../../src/tools/list-workspaces.js'
    );
    const result = await listWorkspaces();

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual<WorkspaceInfo>({
      name: 'workspace-2',
      phase: 'Starting',
      url: '',
      annotations: {},
    });
  });

  it('returns empty items when no workspaces exist', async () => {
    const { getCustomObjectsApi, getNamespace } = await import(
      '../../src/kube/client.js'
    );
    const mockApi = {
      listNamespacedCustomObject: vi.fn().mockResolvedValue({
        items: [],
      }),
    };
    vi.mocked(getCustomObjectsApi).mockReturnValue(mockApi as any);
    vi.mocked(getNamespace).mockReturnValue('test-namespace');

    const { listWorkspaces } = await import(
      '../../src/tools/list-workspaces.js'
    );
    const result = await listWorkspaces();

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.count).toBe(0);
    expect(result.has_more).toBe(false);
  });

  it('populates url from status.mainUrl when present', async () => {
    const { getCustomObjectsApi, getNamespace } = await import(
      '../../src/kube/client.js'
    );
    const mockApi = {
      listNamespacedCustomObject: vi.fn().mockResolvedValue({
        items: [
          {
            metadata: {
              name: 'workspace-3',
              annotations: {
                'che.eclipse.org/agent-tmux': 'session-1',
              },
            },
            status: {
              phase: 'Running',
              mainUrl: 'https://workspace-3.devenv.local',
            },
          },
        ],
      }),
    };
    vi.mocked(getCustomObjectsApi).mockReturnValue(mockApi as any);
    vi.mocked(getNamespace).mockReturnValue('test-namespace');

    const { listWorkspaces } = await import(
      '../../src/tools/list-workspaces.js'
    );
    const result = await listWorkspaces();

    expect(result.items).toHaveLength(1);
    expect(result.items[0].url).toBe('https://workspace-3.devenv.local');
    expect(result.items[0].phase).toBe('Running');
  });

  it('respects limit and offset for pagination', async () => {
    const { getCustomObjectsApi, getNamespace } = await import(
      '../../src/kube/client.js'
    );
    const items = Array.from({ length: 5 }, (_, i) => ({
      metadata: { name: `workspace-${i + 1}`, annotations: {} },
      status: { phase: 'Running', mainUrl: '' },
    }));
    const mockApi = {
      listNamespacedCustomObject: vi.fn().mockResolvedValue({ items }),
    };
    vi.mocked(getCustomObjectsApi).mockReturnValue(mockApi as any);
    vi.mocked(getNamespace).mockReturnValue('test-namespace');

    const { listWorkspaces } = await import(
      '../../src/tools/list-workspaces.js'
    );
    const result = await listWorkspaces({ limit: 2, offset: 1 });

    expect(result.total).toBe(5);
    expect(result.count).toBe(2);
    expect(result.offset).toBe(1);
    expect(result.has_more).toBe(true);
    expect(result.items.map((w) => w.name)).toEqual([
      'workspace-2',
      'workspace-3',
    ]);
  });

  it('has_more is false when last page is reached', async () => {
    const { getCustomObjectsApi, getNamespace } = await import(
      '../../src/kube/client.js'
    );
    const items = Array.from({ length: 3 }, (_, i) => ({
      metadata: { name: `workspace-${i + 1}`, annotations: {} },
      status: { phase: 'Running', mainUrl: '' },
    }));
    const mockApi = {
      listNamespacedCustomObject: vi.fn().mockResolvedValue({ items }),
    };
    vi.mocked(getCustomObjectsApi).mockReturnValue(mockApi as any);
    vi.mocked(getNamespace).mockReturnValue('test-namespace');

    const { listWorkspaces } = await import(
      '../../src/tools/list-workspaces.js'
    );
    const result = await listWorkspaces({ limit: 2, offset: 2 });

    expect(result.total).toBe(3);
    expect(result.count).toBe(1);
    expect(result.has_more).toBe(false);
  });
});
