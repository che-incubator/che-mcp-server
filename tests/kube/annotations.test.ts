import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/kube/client.js');

describe('readAgentAnnotations', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('returns annotation values when all annotations present', async () => {
    const { getCustomObjectsApi, getNamespace } = await import(
      '../../src/kube/client.js'
    );
    vi.mocked(getNamespace).mockReturnValue('user-che');
    vi.mocked(getCustomObjectsApi).mockReturnValue({
      getNamespacedCustomObject: vi.fn().mockResolvedValue({
        metadata: {
          annotations: {
            'che.eclipse.org/agent-session': 'agent',
            'che.eclipse.org/agent-type': 'claude-code',
            'che.eclipse.org/agent-task': 'fix bug',
            'che.eclipse.org/agent-launched-at': '2026-04-08T10:00:00Z',
          },
        },
      }),
    } as any);

    const { readAgentAnnotations } = await import(
      '../../src/kube/annotations.js'
    );
    const result = await readAgentAnnotations('my-workspace');

    expect(result).toEqual({
      session: 'agent',
      agent_type: 'claude-code',
      task: 'fix bug',
      launched_at: '2026-04-08T10:00:00Z',
    });
  });

  it('returns nulls when annotations are absent', async () => {
    const { getCustomObjectsApi, getNamespace } = await import(
      '../../src/kube/client.js'
    );
    vi.mocked(getNamespace).mockReturnValue('user-che');
    vi.mocked(getCustomObjectsApi).mockReturnValue({
      getNamespacedCustomObject: vi.fn().mockResolvedValue({
        metadata: { annotations: {} },
      }),
    } as any);

    const { readAgentAnnotations } = await import(
      '../../src/kube/annotations.js'
    );
    const result = await readAgentAnnotations('my-workspace');

    expect(result).toEqual({
      session: null,
      agent_type: null,
      task: null,
      launched_at: null,
    });
  });

  it('returns nulls when metadata.annotations is missing', async () => {
    const { getCustomObjectsApi, getNamespace } = await import(
      '../../src/kube/client.js'
    );
    vi.mocked(getNamespace).mockReturnValue('user-che');
    vi.mocked(getCustomObjectsApi).mockReturnValue({
      getNamespacedCustomObject: vi.fn().mockResolvedValue({ metadata: {} }),
    } as any);

    const { readAgentAnnotations } = await import(
      '../../src/kube/annotations.js'
    );
    const result = await readAgentAnnotations('my-workspace');

    expect(result).toEqual({
      session: null,
      agent_type: null,
      task: null,
      launched_at: null,
    });
  });
});

describe('writeAgentAnnotations', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('sends a JSON patch array with op:add for each annotation key', async () => {
    const { getCustomObjectsApi, getNamespace } = await import(
      '../../src/kube/client.js'
    );
    const patchMock = vi.fn().mockResolvedValue({});
    vi.mocked(getNamespace).mockReturnValue('user-che');
    vi.mocked(getCustomObjectsApi).mockReturnValue({
      patchNamespacedCustomObject: patchMock,
    } as any);

    const { writeAgentAnnotations } = await import(
      '../../src/kube/annotations.js'
    );
    await writeAgentAnnotations('my-workspace', {
      session: 'agent',
      agent_type: 'claude-code',
      task: 'fix bug',
      launched_at: '2026-04-08T10:00:00Z',
    });

    expect(patchMock).toHaveBeenCalled();
    const body = patchMock.mock.calls[0][0].body as any[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.every((op: any) => op.op === 'add')).toBe(true);

    const byPath = Object.fromEntries(
      body.map((op: any) => [op.path, op.value]),
    );
    expect(byPath['/metadata/annotations/che.eclipse.org~1agent-session']).toBe(
      'agent',
    );
    expect(byPath['/metadata/annotations/che.eclipse.org~1agent-type']).toBe(
      'claude-code',
    );
    expect(byPath['/metadata/annotations/che.eclipse.org~1agent-task']).toBe(
      'fix bug',
    );
    expect(
      byPath['/metadata/annotations/che.eclipse.org~1agent-launched-at'],
    ).toBe('2026-04-08T10:00:00Z');
  });

  it('skips null values (does not write them)', async () => {
    const { getCustomObjectsApi, getNamespace } = await import(
      '../../src/kube/client.js'
    );
    const patchMock = vi.fn().mockResolvedValue({});
    vi.mocked(getNamespace).mockReturnValue('user-che');
    vi.mocked(getCustomObjectsApi).mockReturnValue({
      patchNamespacedCustomObject: patchMock,
    } as any);

    const { writeAgentAnnotations } = await import(
      '../../src/kube/annotations.js'
    );
    await writeAgentAnnotations('my-workspace', {
      session: 'agent',
      agent_type: null,
      task: null,
      launched_at: null,
    });

    const body = patchMock.mock.calls[0][0].body as any[];
    expect(body).toHaveLength(1);
    expect(body[0].path).toContain('agent-session');
  });
});

describe('clearAgentAnnotations', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('sends op:remove for annotation keys that exist', async () => {
    const { getCustomObjectsApi, getNamespace } = await import(
      '../../src/kube/client.js'
    );
    const patchMock = vi.fn().mockResolvedValue({});
    vi.mocked(getNamespace).mockReturnValue('user-che');
    vi.mocked(getCustomObjectsApi).mockReturnValue({
      getNamespacedCustomObject: vi.fn().mockResolvedValue({
        metadata: {
          annotations: {
            'che.eclipse.org/agent-session': 'agent',
            'che.eclipse.org/agent-type': 'claude-code',
            'che.eclipse.org/agent-task': 'fix bug',
            'che.eclipse.org/agent-launched-at': '2026-04-08T10:00:00Z',
          },
        },
      }),
      patchNamespacedCustomObject: patchMock,
    } as any);

    const { clearAgentAnnotations } = await import(
      '../../src/kube/annotations.js'
    );
    await clearAgentAnnotations('my-workspace');

    const body = patchMock.mock.calls[0][0].body as any[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.every((op: any) => op.op === 'remove')).toBe(true);
    expect(body).toHaveLength(4);
  });

  it('skips patch call when no agent annotations are present', async () => {
    const { getCustomObjectsApi, getNamespace } = await import(
      '../../src/kube/client.js'
    );
    const patchMock = vi.fn().mockResolvedValue({});
    vi.mocked(getNamespace).mockReturnValue('user-che');
    vi.mocked(getCustomObjectsApi).mockReturnValue({
      getNamespacedCustomObject: vi
        .fn()
        .mockResolvedValue({ metadata: { annotations: {} } }),
      patchNamespacedCustomObject: patchMock,
    } as any);

    const { clearAgentAnnotations } = await import(
      '../../src/kube/annotations.js'
    );
    await clearAgentAnnotations('my-workspace');

    expect(patchMock).not.toHaveBeenCalled();
  });
});
