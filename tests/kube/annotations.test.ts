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

describe('readAgentSessions', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('returns empty array when no annotations present', async () => {
    const { getCustomObjectsApi, getNamespace } = await import('../../src/kube/client.js');
    vi.mocked(getNamespace).mockReturnValue('user-che');
    vi.mocked(getCustomObjectsApi).mockReturnValue({
      getNamespacedCustomObject: vi.fn().mockResolvedValue({
        metadata: { annotations: {} },
      }),
    } as any);

    const { readAgentSessions } = await import('../../src/kube/annotations.js');
    const result = await readAgentSessions('my-workspace');

    expect(result).toEqual([]);
  });

  it('parses JSON array from ANN_SESSIONS annotation', async () => {
    const { getCustomObjectsApi, getNamespace } = await import('../../src/kube/client.js');
    vi.mocked(getNamespace).mockReturnValue('user-che');
    vi.mocked(getCustomObjectsApi).mockReturnValue({
      getNamespacedCustomObject: vi.fn().mockResolvedValue({
        metadata: {
          annotations: {
            'che.eclipse.org/agent-sessions': JSON.stringify([
              {
                session_id: 'agent-1',
                backend: 'claude-code',
                status: 'running',
                working_dir: '/projects',
                task: 'fix bug',
                launched_at: '2026-04-08T10:00:00Z',
              },
              {
                session_id: 'agent-2',
                backend: 'picoclaw',
                status: 'running',
                working_dir: '/projects',
                task: 'write tests',
                launched_at: '2026-04-08T11:00:00Z',
              },
            ]),
          },
        },
      }),
    } as any);

    const { readAgentSessions } = await import('../../src/kube/annotations.js');
    const result = await readAgentSessions('my-workspace');

    expect(result).toEqual([
      {
        session_id: 'agent-1',
        backend: 'claude-code',
        status: 'running',
        working_dir: '/projects',
        task: 'fix bug',
        launched_at: '2026-04-08T10:00:00Z',
      },
      {
        session_id: 'agent-2',
        backend: 'picoclaw',
        status: 'running',
        working_dir: '/projects',
        task: 'write tests',
        launched_at: '2026-04-08T11:00:00Z',
      },
    ]);
  });

  it('converts legacy singular annotations to array format', async () => {
    const { getCustomObjectsApi, getNamespace } = await import('../../src/kube/client.js');
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

    const { readAgentSessions } = await import('../../src/kube/annotations.js');
    const result = await readAgentSessions('my-workspace');

    expect(result).toEqual([
      {
        session_id: 'agent',
        backend: 'claude-code',
        status: 'running',
        working_dir: '/projects',
        task: 'fix bug',
        launched_at: '2026-04-08T10:00:00Z',
      },
    ]);
  });

  it('falls back to legacy annotations when ANN_SESSIONS contains malformed JSON', async () => {
    const { getCustomObjectsApi, getNamespace } = await import('../../src/kube/client.js');
    vi.mocked(getNamespace).mockReturnValue('user-che');
    vi.mocked(getCustomObjectsApi).mockReturnValue({
      getNamespacedCustomObject: vi.fn().mockResolvedValue({
        metadata: {
          annotations: {
            'che.eclipse.org/agent-sessions': '{not valid json!!!',
            'che.eclipse.org/agent-session': 'legacy-agent',
            'che.eclipse.org/agent-type': 'claude-code',
            'che.eclipse.org/agent-task': 'legacy task',
            'che.eclipse.org/agent-launched-at': '2026-04-08T12:00:00Z',
          },
        },
      }),
    } as any);

    const { readAgentSessions } = await import('../../src/kube/annotations.js');
    const result = await readAgentSessions('my-workspace');

    expect(result).toEqual([
      {
        session_id: 'legacy-agent',
        backend: 'claude-code',
        status: 'running',
        working_dir: '/projects',
        task: 'legacy task',
        launched_at: '2026-04-08T12:00:00Z',
      },
    ]);
  });

  it('returns empty array when ANN_SESSIONS is malformed and no legacy annotations exist', async () => {
    const { getCustomObjectsApi, getNamespace } = await import('../../src/kube/client.js');
    vi.mocked(getNamespace).mockReturnValue('user-che');
    vi.mocked(getCustomObjectsApi).mockReturnValue({
      getNamespacedCustomObject: vi.fn().mockResolvedValue({
        metadata: {
          annotations: {
            'che.eclipse.org/agent-sessions': '{not valid json!!!',
          },
        },
      }),
    } as any);

    const { readAgentSessions } = await import('../../src/kube/annotations.js');
    const result = await readAgentSessions('my-workspace');

    expect(result).toEqual([]);
  });

  it('falls back to legacy annotations when ANN_SESSIONS is valid JSON but not an array', async () => {
    const { getCustomObjectsApi, getNamespace } = await import('../../src/kube/client.js');
    vi.mocked(getNamespace).mockReturnValue('user-che');
    vi.mocked(getCustomObjectsApi).mockReturnValue({
      getNamespacedCustomObject: vi.fn().mockResolvedValue({
        metadata: {
          annotations: {
            'che.eclipse.org/agent-sessions': JSON.stringify({ key: 'value' }),
            'che.eclipse.org/agent-session': 'legacy-agent',
            'che.eclipse.org/agent-type': 'picoclaw',
            'che.eclipse.org/agent-task': 'object fallback task',
            'che.eclipse.org/agent-launched-at': '2026-04-08T13:00:00Z',
          },
        },
      }),
    } as any);

    const { readAgentSessions } = await import('../../src/kube/annotations.js');
    const result = await readAgentSessions('my-workspace');

    expect(result).toEqual([
      {
        session_id: 'legacy-agent',
        backend: 'picoclaw',
        status: 'running',
        working_dir: '/projects',
        task: 'object fallback task',
        launched_at: '2026-04-08T13:00:00Z',
      },
    ]);
  });

  it('returns empty array when ANN_SESSIONS is valid JSON but not an array and no legacy annotations exist', async () => {
    const { getCustomObjectsApi, getNamespace } = await import('../../src/kube/client.js');
    vi.mocked(getNamespace).mockReturnValue('user-che');
    vi.mocked(getCustomObjectsApi).mockReturnValue({
      getNamespacedCustomObject: vi.fn().mockResolvedValue({
        metadata: {
          annotations: {
            'che.eclipse.org/agent-sessions': JSON.stringify({ key: 'value' }),
          },
        },
      }),
    } as any);

    const { readAgentSessions } = await import('../../src/kube/annotations.js');
    const result = await readAgentSessions('my-workspace');

    expect(result).toEqual([]);
  });
});

describe('addAgentSession', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('appends entry and writes back with resourceVersion precondition', async () => {
    const { getCustomObjectsApi, getNamespace } = await import('../../src/kube/client.js');
    const patchMock = vi.fn().mockResolvedValue({});
    vi.mocked(getNamespace).mockReturnValue('user-che');
    vi.mocked(getCustomObjectsApi).mockReturnValue({
      getNamespacedCustomObject: vi.fn().mockResolvedValue({
        metadata: {
          resourceVersion: '12345',
          annotations: {
            'che.eclipse.org/agent-sessions': JSON.stringify([
              {
                session_id: 'agent-1',
                backend: 'claude-code',
                status: 'running',
                working_dir: '/projects',
                task: 'fix bug',
                launched_at: '2026-04-08T10:00:00Z',
              },
            ]),
          },
        },
      }),
      patchNamespacedCustomObject: patchMock,
    } as any);

    const { addAgentSession } = await import('../../src/kube/annotations.js');
    await addAgentSession('my-workspace', {
      session_id: 'agent-2',
      backend: 'picoclaw',
      status: 'running',
      working_dir: '/projects',
      task: 'write tests',
      launched_at: '2026-04-08T11:00:00Z',
    });

    expect(patchMock).toHaveBeenCalled();
    const body = patchMock.mock.calls[0][0].body as any[];
    expect(body).toHaveLength(2);

    // First op is the resourceVersion precondition
    expect(body[0].op).toBe('test');
    expect(body[0].path).toBe('/metadata/resourceVersion');
    expect(body[0].value).toBe('12345');

    // Second op is the actual annotation write
    expect(body[1].op).toBe('add');
    expect(body[1].path).toBe('/metadata/annotations/che.eclipse.org~1agent-sessions');

    const sessions = JSON.parse(body[1].value);
    expect(sessions).toHaveLength(2);
    expect(sessions[1].session_id).toBe('agent-2');
  });

  it('retries on 409 Conflict', async () => {
    const { getCustomObjectsApi, getNamespace } = await import('../../src/kube/client.js');
    const getMock = vi.fn()
      .mockResolvedValueOnce({
        metadata: {
          resourceVersion: '100',
          annotations: {
            'che.eclipse.org/agent-sessions': JSON.stringify([]),
          },
        },
      })
      .mockResolvedValueOnce({
        metadata: {
          resourceVersion: '101',
          annotations: {
            'che.eclipse.org/agent-sessions': JSON.stringify([]),
          },
        },
      });
    const patchMock = vi.fn()
      .mockRejectedValueOnce({ statusCode: 409 })
      .mockResolvedValueOnce({});
    vi.mocked(getNamespace).mockReturnValue('user-che');
    vi.mocked(getCustomObjectsApi).mockReturnValue({
      getNamespacedCustomObject: getMock,
      patchNamespacedCustomObject: patchMock,
    } as any);

    const { addAgentSession } = await import('../../src/kube/annotations.js');
    await addAgentSession('my-workspace', {
      session_id: 'agent-1',
      backend: 'claude-code',
      status: 'running',
      working_dir: '/projects',
      task: 'fix bug',
      launched_at: '2026-04-08T10:00:00Z',
    });

    expect(getMock).toHaveBeenCalledTimes(2);
    expect(patchMock).toHaveBeenCalledTimes(2);

    // Second attempt should use updated resourceVersion
    const secondBody = patchMock.mock.calls[1][0].body as any[];
    expect(secondBody[0].value).toBe('101');
  });

  it('retries on 422 (JSON patch test failure)', async () => {
    const { getCustomObjectsApi, getNamespace } = await import('../../src/kube/client.js');
    const getMock = vi.fn()
      .mockResolvedValueOnce({
        metadata: {
          resourceVersion: '200',
          annotations: { 'che.eclipse.org/agent-sessions': '[]' },
        },
      })
      .mockResolvedValueOnce({
        metadata: {
          resourceVersion: '201',
          annotations: { 'che.eclipse.org/agent-sessions': '[]' },
        },
      });
    const patchMock = vi.fn()
      .mockRejectedValueOnce({ response: { statusCode: 422 } })
      .mockResolvedValueOnce({});
    vi.mocked(getNamespace).mockReturnValue('user-che');
    vi.mocked(getCustomObjectsApi).mockReturnValue({
      getNamespacedCustomObject: getMock,
      patchNamespacedCustomObject: patchMock,
    } as any);

    const { addAgentSession } = await import('../../src/kube/annotations.js');
    await addAgentSession('my-workspace', {
      session_id: 'agent-1',
      backend: 'claude-code',
      status: 'running',
      working_dir: '/projects',
      task: 'test',
      launched_at: '2026-04-08T10:00:00Z',
    });

    expect(getMock).toHaveBeenCalledTimes(2);
    expect(patchMock).toHaveBeenCalledTimes(2);
  });

  it('throws after max retries exceeded', async () => {
    const { getCustomObjectsApi, getNamespace } = await import('../../src/kube/client.js');
    const getMock = vi.fn().mockResolvedValue({
      metadata: {
        resourceVersion: '100',
        annotations: { 'che.eclipse.org/agent-sessions': '[]' },
      },
    });
    const patchMock = vi.fn().mockRejectedValue({ statusCode: 409 });
    vi.mocked(getNamespace).mockReturnValue('user-che');
    vi.mocked(getCustomObjectsApi).mockReturnValue({
      getNamespacedCustomObject: getMock,
      patchNamespacedCustomObject: patchMock,
    } as any);

    const { addAgentSession } = await import('../../src/kube/annotations.js');
    await expect(
      addAgentSession('my-workspace', {
        session_id: 'agent-1',
        backend: 'claude-code',
        status: 'running',
        working_dir: '/projects',
        task: 'fix bug',
        launched_at: '2026-04-08T10:00:00Z',
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(getMock).toHaveBeenCalledTimes(3);
    expect(patchMock).toHaveBeenCalledTimes(3);
  });
});

describe('removeAgentSession', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('removes by session_id with resourceVersion precondition', async () => {
    const { getCustomObjectsApi, getNamespace } = await import('../../src/kube/client.js');
    const patchMock = vi.fn().mockResolvedValue({});
    vi.mocked(getNamespace).mockReturnValue('user-che');
    vi.mocked(getCustomObjectsApi).mockReturnValue({
      getNamespacedCustomObject: vi.fn().mockResolvedValue({
        metadata: {
          resourceVersion: '555',
          annotations: {
            'che.eclipse.org/agent-sessions': JSON.stringify([
              {
                session_id: 'agent-1',
                backend: 'claude-code',
                status: 'running',
                working_dir: '/projects',
                task: 'fix bug',
                launched_at: '2026-04-08T10:00:00Z',
              },
              {
                session_id: 'agent-2',
                backend: 'picoclaw',
                status: 'running',
                working_dir: '/projects',
                task: 'write tests',
                launched_at: '2026-04-08T11:00:00Z',
              },
            ]),
          },
        },
      }),
      patchNamespacedCustomObject: patchMock,
    } as any);

    const { removeAgentSession } = await import('../../src/kube/annotations.js');
    await removeAgentSession('my-workspace', 'agent-1');

    expect(patchMock).toHaveBeenCalled();
    const body = patchMock.mock.calls[0][0].body as any[];
    expect(body).toHaveLength(2);

    // First op is the resourceVersion precondition
    expect(body[0].op).toBe('test');
    expect(body[0].path).toBe('/metadata/resourceVersion');
    expect(body[0].value).toBe('555');

    // Second op is the annotation write
    const sessions = JSON.parse(body[1].value);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].session_id).toBe('agent-2');
  });

  it('writes empty array when last session removed', async () => {
    const { getCustomObjectsApi, getNamespace } = await import('../../src/kube/client.js');
    const patchMock = vi.fn().mockResolvedValue({});
    vi.mocked(getNamespace).mockReturnValue('user-che');
    vi.mocked(getCustomObjectsApi).mockReturnValue({
      getNamespacedCustomObject: vi.fn().mockResolvedValue({
        metadata: {
          resourceVersion: '777',
          annotations: {
            'che.eclipse.org/agent-sessions': JSON.stringify([
              {
                session_id: 'agent-1',
                backend: 'claude-code',
                status: 'running',
                working_dir: '/projects',
                task: 'fix bug',
                launched_at: '2026-04-08T10:00:00Z',
              },
            ]),
          },
        },
      }),
      patchNamespacedCustomObject: patchMock,
    } as any);

    const { removeAgentSession } = await import('../../src/kube/annotations.js');
    await removeAgentSession('my-workspace', 'agent-1');

    expect(patchMock).toHaveBeenCalled();
    const body = patchMock.mock.calls[0][0].body as any[];
    const sessions = JSON.parse(body[1].value);
    expect(sessions).toEqual([]);
  });

  it('retries on conflict and succeeds', async () => {
    const { getCustomObjectsApi, getNamespace } = await import('../../src/kube/client.js');
    const getMock = vi.fn()
      .mockResolvedValueOnce({
        metadata: {
          resourceVersion: '300',
          annotations: {
            'che.eclipse.org/agent-sessions': JSON.stringify([
              { session_id: 'agent-1', backend: 'claude-code', status: 'running', working_dir: '/projects', task: 'a', launched_at: '' },
            ]),
          },
        },
      })
      .mockResolvedValueOnce({
        metadata: {
          resourceVersion: '301',
          annotations: {
            'che.eclipse.org/agent-sessions': JSON.stringify([
              { session_id: 'agent-1', backend: 'claude-code', status: 'running', working_dir: '/projects', task: 'a', launched_at: '' },
            ]),
          },
        },
      });
    const patchMock = vi.fn()
      .mockRejectedValueOnce({ body: { code: 409 } })
      .mockResolvedValueOnce({});
    vi.mocked(getNamespace).mockReturnValue('user-che');
    vi.mocked(getCustomObjectsApi).mockReturnValue({
      getNamespacedCustomObject: getMock,
      patchNamespacedCustomObject: patchMock,
    } as any);

    const { removeAgentSession } = await import('../../src/kube/annotations.js');
    await removeAgentSession('my-workspace', 'agent-1');

    expect(getMock).toHaveBeenCalledTimes(2);
    expect(patchMock).toHaveBeenCalledTimes(2);

    // Second attempt should use updated resourceVersion
    const secondBody = patchMock.mock.calls[1][0].body as any[];
    expect(secondBody[0].value).toBe('301');
  });

  it('throws after max retries exceeded', async () => {
    const { getCustomObjectsApi, getNamespace } = await import('../../src/kube/client.js');
    const getMock = vi.fn().mockResolvedValue({
      metadata: {
        resourceVersion: '400',
        annotations: {
          'che.eclipse.org/agent-sessions': JSON.stringify([
            { session_id: 'agent-1', backend: 'claude-code', status: 'running', working_dir: '/projects', task: 'a', launched_at: '' },
          ]),
        },
      },
    });
    const patchMock = vi.fn().mockRejectedValue({ statusCode: 422 });
    vi.mocked(getNamespace).mockReturnValue('user-che');
    vi.mocked(getCustomObjectsApi).mockReturnValue({
      getNamespacedCustomObject: getMock,
      patchNamespacedCustomObject: patchMock,
    } as any);

    const { removeAgentSession } = await import('../../src/kube/annotations.js');
    await expect(
      removeAgentSession('my-workspace', 'agent-1'),
    ).rejects.toMatchObject({ statusCode: 422 });

    expect(getMock).toHaveBeenCalledTimes(3);
    expect(patchMock).toHaveBeenCalledTimes(3);
  });
});
