import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/kube/client.js', () => ({
  getCustomObjectsApi: vi.fn(),
  getNamespace: vi.fn().mockReturnValue('test-namespace'),
}));

// ─── buildJsonPatchOps (pure function — no mocks needed) ─────────────────────

describe('buildJsonPatchOps', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns a JSON patch array — every entry has op+path, never a component shape', async () => {
    const { buildJsonPatchOps } = await import(
      '../../src/orchestrator/tool-injector.js'
    );
    const dw = {
      spec: {
        template: {
          components: [{ name: 'dev', container: { image: 'my-image' } }],
        },
      },
    };

    const ops = buildJsonPatchOps('opencode', dw);

    expect(Array.isArray(ops)).toBe(true);
    for (const op of ops) {
      expect(op).toHaveProperty('op');
      expect(op).toHaveProperty('path');
      // Must NOT look like a component object
      expect(op).not.toHaveProperty('name');
      expect(op).not.toHaveProperty('container');
      expect(op).not.toHaveProperty('volume');
    }
  });

  it('includes an op that adds the injected-tools volume', async () => {
    const { buildJsonPatchOps } = await import(
      '../../src/orchestrator/tool-injector.js'
    );
    const dw = {
      spec: {
        template: {
          components: [{ name: 'dev', container: { image: 'my-image' } }],
        },
      },
    };

    const ops = buildJsonPatchOps('opencode', dw);

    const volumeOp = ops.find(
      (o) => o.op === 'add' && (o.value as any)?.name === 'injected-tools',
    );
    expect(volumeOp).toBeDefined();
  });

  it('includes an op that adds the injector init container with correct image', async () => {
    const { buildJsonPatchOps } = await import(
      '../../src/orchestrator/tool-injector.js'
    );
    const dw = {
      spec: {
        template: {
          components: [{ name: 'dev', container: { image: 'my-image' } }],
        },
      },
    };

    const ops = buildJsonPatchOps('opencode', dw);

    const injectorOp = ops.find(
      (o) => o.op === 'add' && (o.value as any)?.name === 'opencode-injector',
    );
    expect(injectorOp).toBeDefined();
    expect((injectorOp!.value as any).container.image).toBe(
      'quay.io/che-incubator/tools-injector/opencode:next',
    );
  });

  it('includes ops that add volume mount and PATH env to editor container', async () => {
    const { buildJsonPatchOps } = await import(
      '../../src/orchestrator/tool-injector.js'
    );
    const dw = {
      spec: {
        template: {
          components: [{ name: 'dev', container: { image: 'my-image' } }],
        },
      },
    };

    const ops = buildJsonPatchOps('opencode', dw);

    const mountOp = ops.find(
      (o) => o.op === 'add' && o.path.includes('volumeMounts'),
    );
    expect(mountOp).toBeDefined();

    const pathOp = ops.find((o) => {
      const v = o.value as any;
      return (
        o.op === 'add' && (Array.isArray(v) ? v[0]?.name : v?.name) === 'PATH'
      );
    });
    expect(pathOp).toBeDefined();
  });

  it('skips injected-tools volume op when already present', async () => {
    const { buildJsonPatchOps } = await import(
      '../../src/orchestrator/tool-injector.js'
    );
    const dw = {
      spec: {
        template: {
          components: [
            { name: 'dev', container: { image: 'my-image' } },
            { name: 'injected-tools', volume: { size: '256Mi' } },
          ],
        },
      },
    };

    const ops = buildJsonPatchOps('opencode', dw);

    const volumeOps = ops.filter(
      (o) => (o.value as any)?.name === 'injected-tools',
    );
    expect(volumeOps).toHaveLength(0);
  });

  it('skips volume mount op when mount already present on editor', async () => {
    const { buildJsonPatchOps } = await import(
      '../../src/orchestrator/tool-injector.js'
    );
    const dw = {
      spec: {
        template: {
          components: [
            {
              name: 'dev',
              container: {
                image: 'my-image',
                volumeMounts: [
                  { name: 'injected-tools', path: '/injected-tools' },
                ],
              },
            },
          ],
        },
      },
    };

    const ops = buildJsonPatchOps('opencode', dw);
    const mountOps = ops.filter(
      (o) => o.op === 'add' && o.path.includes('volumeMounts'),
    );
    expect(mountOps).toHaveLength(0);
  });

  it('skips PATH op when PATH already present on editor', async () => {
    const { buildJsonPatchOps } = await import(
      '../../src/orchestrator/tool-injector.js'
    );
    const dw = {
      spec: {
        template: {
          components: [
            {
              name: 'dev',
              container: {
                image: 'my-image',
                env: [{ name: 'PATH', value: '/injected-tools/bin:/usr/bin' }],
              },
            },
          ],
        },
      },
    };

    const ops = buildJsonPatchOps('opencode', dw);
    const pathOps = ops.filter((o) => {
      const v = o.value as any;
      return (Array.isArray(v) ? v[0]?.name : v?.name) === 'PATH';
    });
    expect(pathOps).toHaveLength(0);
  });

  it('returns only infra+tool ops when no editor component is found', async () => {
    const { buildJsonPatchOps } = await import(
      '../../src/orchestrator/tool-injector.js'
    );
    const dw = { spec: { template: { components: [] } } };

    const ops = buildJsonPatchOps('opencode', dw);

    // Should still include volume and injector ops, but no editor-related ops
    expect(ops.length).toBeGreaterThan(0);
    const hasMountOp = ops.some((o) => o.path.includes('volumeMounts'));
    const hasEnvOp = ops.some((o) => o.path.includes('/env'));
    expect(hasMountOp).toBe(false);
    expect(hasEnvOp).toBe(false);
  });

  it('includes an apply command for the injector component', async () => {
    const { buildJsonPatchOps } = await import(
      '../../src/orchestrator/tool-injector.js'
    );
    const dw = {
      spec: {
        template: {
          components: [{ name: 'dev', container: { image: 'my-image' } }],
        },
      },
    };

    const ops = buildJsonPatchOps('opencode', dw);

    // The apply command may appear as a single object (append via /-) or wrapped in an array
    // (when the commands array is being created for the first time).
    const hasApplyCommand = ops.some((o) => {
      const v = o.value as any;
      if (o.op !== 'add') return false;
      // Appended to existing commands: value is the command object directly
      if (
        v?.id === 'install-opencode' &&
        v?.apply?.component === 'opencode-injector'
      )
        return true;
      // Commands array created fresh: value is an array containing the command
      if (Array.isArray(v)) {
        return v.some(
          (cmd: any) =>
            cmd?.id === 'install-opencode' &&
            cmd?.apply?.component === 'opencode-injector',
        );
      }
      return false;
    });
    expect(hasApplyCommand).toBe(true);
  });

  it('includes a preStart event referencing the apply command', async () => {
    const { buildJsonPatchOps } = await import(
      '../../src/orchestrator/tool-injector.js'
    );
    const dw = {
      spec: {
        template: {
          components: [{ name: 'dev', container: { image: 'my-image' } }],
        },
      },
    };

    const ops = buildJsonPatchOps('opencode', dw);

    const preStartOp = ops.find((o) => {
      const v = o.value as any;
      // Either creating the events object or appending to preStart
      const hasPreStartArray =
        Array.isArray(v?.preStart) && v.preStart.includes('install-opencode');
      const isPreStartAppend =
        o.path === '/spec/template/events/preStart/-' &&
        v === 'install-opencode';
      const isEventsCreate =
        o.path === '/spec/template/events' && hasPreStartArray;
      const isPreStartCreate =
        o.path === '/spec/template/events/preStart' &&
        Array.isArray(v) &&
        v.includes('install-opencode');
      return isEventsCreate || isPreStartCreate || isPreStartAppend;
    });
    expect(preStartOp).toBeDefined();
  });

  it('includes a symlink exec command in the editor container', async () => {
    const { buildJsonPatchOps } = await import(
      '../../src/orchestrator/tool-injector.js'
    );
    const dw = {
      spec: {
        template: {
          components: [{ name: 'dev', container: { image: 'my-image' } }],
        },
      },
    };

    const ops = buildJsonPatchOps('opencode', dw);

    const symlinkOp = ops.find((o) => {
      const v = o.value as any;
      return (
        o.op === 'add' &&
        v?.id === 'symlink-opencode' &&
        v?.exec?.component === 'dev'
      );
    });
    expect(symlinkOp).toBeDefined();
    const cmdline = (symlinkOp!.value as any).exec.commandLine as string;
    expect(cmdline).toContain('/injected-tools/opencode');
    expect(cmdline).toContain('/injected-tools/bin/opencode');
  });

  it('includes a postStart event referencing the symlink command', async () => {
    const { buildJsonPatchOps } = await import(
      '../../src/orchestrator/tool-injector.js'
    );
    const dw = {
      spec: {
        template: {
          components: [{ name: 'dev', container: { image: 'my-image' } }],
        },
      },
    };

    const ops = buildJsonPatchOps('opencode', dw);

    const postStartOp = ops.find((o) => {
      const v = o.value as any;
      const isPostStartCreate =
        o.path === '/spec/template/events/postStart' &&
        Array.isArray(v) &&
        v.includes('symlink-opencode');
      const isPostStartAppend =
        o.path === '/spec/template/events/postStart/-' &&
        v === 'symlink-opencode';
      return isPostStartCreate || isPostStartAppend;
    });
    expect(postStartOp).toBeDefined();
  });

  it('creates commands array when no commands exist', async () => {
    const { buildJsonPatchOps } = await import(
      '../../src/orchestrator/tool-injector.js'
    );
    // dw has no commands key at all
    const dw = {
      spec: {
        template: {
          components: [{ name: 'dev', container: { image: 'my-image' } }],
        },
      },
    };

    const ops = buildJsonPatchOps('opencode', dw);

    const createOp = ops.find(
      (o) => o.op === 'add' && o.path === '/spec/template/commands',
    );
    expect(createOp).toBeDefined();
    expect(Array.isArray(createOp!.value as any)).toBe(true);
  });

  it('appends to existing commands array when commands already exist', async () => {
    const { buildJsonPatchOps } = await import(
      '../../src/orchestrator/tool-injector.js'
    );
    const dw = {
      spec: {
        template: {
          components: [{ name: 'dev', container: { image: 'my-image' } }],
          commands: [{ id: 'existing-cmd', apply: { component: 'some-comp' } }],
        },
      },
    };

    const ops = buildJsonPatchOps('opencode', dw);

    // Must use /- to append, not create a new array
    const appendOps = ops.filter(
      (o) => o.op === 'add' && o.path === '/spec/template/commands/-',
    );
    expect(appendOps.length).toBeGreaterThanOrEqual(1);
    // Must NOT recreate the commands array
    const createOp = ops.find(
      (o) => o.op === 'add' && o.path === '/spec/template/commands',
    );
    expect(createOp).toBeUndefined();
  });

  it('creates events object when no events exist', async () => {
    const { buildJsonPatchOps } = await import(
      '../../src/orchestrator/tool-injector.js'
    );
    const dw = {
      spec: {
        template: {
          components: [{ name: 'dev', container: { image: 'my-image' } }],
        },
      },
    };

    const ops = buildJsonPatchOps('opencode', dw);

    // events object should be created with preStart populated
    const createEventsOp = ops.find(
      (o) => o.op === 'add' && o.path === '/spec/template/events',
    );
    expect(createEventsOp).toBeDefined();
    expect((createEventsOp!.value as any)?.preStart).toContain(
      'install-opencode',
    );
  });

  it('appends to existing preStart when events and preStart already exist', async () => {
    const { buildJsonPatchOps } = await import(
      '../../src/orchestrator/tool-injector.js'
    );
    const dw = {
      spec: {
        template: {
          components: [{ name: 'dev', container: { image: 'my-image' } }],
          events: { preStart: ['existing-cmd'] },
        },
      },
    };

    const ops = buildJsonPatchOps('opencode', dw);

    const appendOp = ops.find(
      (o) =>
        o.op === 'add' &&
        o.path === '/spec/template/events/preStart/-' &&
        o.value === 'install-opencode',
    );
    expect(appendOp).toBeDefined();
    // Must not recreate the events object
    const createEventsOp = ops.find(
      (o) => o.op === 'add' && o.path === '/spec/template/events',
    );
    expect(createEventsOp).toBeUndefined();
  });

  it('returns empty array when the tool injector component already exists (idempotency)', async () => {
    const { buildJsonPatchOps } = await import(
      '../../src/orchestrator/tool-injector.js'
    );
    const dw = {
      spec: {
        template: {
          components: [
            { name: 'dev', container: { image: 'my-image' } },
            { name: 'opencode-injector', container: { image: 'some-image' } },
          ],
        },
      },
    };

    const ops = buildJsonPatchOps('opencode', dw);
    expect(ops).toHaveLength(0);
  });

  it('editor stays at original index regardless of prepended infra ops', async () => {
    const { buildJsonPatchOps } = await import(
      '../../src/orchestrator/tool-injector.js'
    );
    // dev is at index 1 (after a pre-existing unrelated component)
    const dw = {
      spec: {
        template: {
          components: [
            { name: 'other-volume', volume: {} },
            { name: 'dev', container: { image: 'my-image' } },
          ],
        },
      },
    };

    const ops = buildJsonPatchOps('opencode', dw);

    // Editor ops must target index 1
    const editorOps = ops.filter((o) =>
      o.path.startsWith('/spec/template/components/1/'),
    );
    expect(editorOps.length).toBeGreaterThan(0);
  });
});

// ─── validateTool ─────────────────────────────────────────────────────────────

describe('validateTool', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('does not throw for known tools', async () => {
    const { validateTool } = await import(
      '../../src/orchestrator/tool-injector.js'
    );
    expect(() => validateTool('opencode')).not.toThrow();
    expect(() => validateTool('tmux')).not.toThrow();
    expect(() => validateTool('claude-code')).not.toThrow();
  });

  it('throws with available tools list for unknown tool', async () => {
    const { validateTool } = await import(
      '../../src/orchestrator/tool-injector.js'
    );
    expect(() => validateTool('nonexistent')).toThrow(
      'Unknown tool "nonexistent"',
    );
    expect(() => validateTool('nonexistent')).toThrow('Available:');
  });
});

// ─── injectToolIntoWorkspace — verifies JSON patch array sent to k8s ──────────

describe('injectToolIntoWorkspace', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('sends a JSON patch array (not a merge-patch object) to patchNamespacedCustomObject', async () => {
    const { getCustomObjectsApi } = await import('../../src/kube/client.js');

    const mockDw = {
      spec: {
        template: {
          components: [{ name: 'dev', container: { image: 'my-image' } }],
        },
      },
    };
    const patchSpy = vi.fn().mockResolvedValue({});

    vi.mocked(getCustomObjectsApi).mockReturnValue({
      getNamespacedCustomObject: vi.fn().mockResolvedValue(mockDw),
      patchNamespacedCustomObject: patchSpy,
    } as any);

    const { injectToolIntoWorkspace } = await import(
      '../../src/orchestrator/tool-injector.js'
    );
    await injectToolIntoWorkspace('my-workspace', 'opencode');

    const callArgs = patchSpy.mock.calls[0][0];

    // Body must be a JSON patch array, not a merge-patch object.
    // The k8s client sends application/json-patch+json; API expects an array.
    expect(Array.isArray(callArgs.body)).toBe(true);

    // Every element must be a patch op
    for (const op of callArgs.body as any[]) {
      expect(op).toHaveProperty('op');
      expect(op).toHaveProperty('path');
    }
  });

  it('creates metadata.annotations object when annotations are absent', async () => {
    const { getCustomObjectsApi } = await import('../../src/kube/client.js');

    // No metadata.annotations — typical for a just-created workspace with started:false
    const mockDw = {
      metadata: {},
      spec: {
        template: {
          components: [{ name: 'dev', container: { image: 'my-image' } }],
        },
      },
    };
    const patchSpy = vi.fn().mockResolvedValue({});

    vi.mocked(getCustomObjectsApi).mockReturnValue({
      getNamespacedCustomObject: vi.fn().mockResolvedValue(mockDw),
      patchNamespacedCustomObject: patchSpy,
    } as any);

    const { injectToolIntoWorkspace } = await import(
      '../../src/orchestrator/tool-injector.js'
    );
    await injectToolIntoWorkspace('my-workspace', 'opencode');

    // Second call creates the annotations object
    expect(patchSpy).toHaveBeenCalledTimes(2);
    const annotationBody = patchSpy.mock.calls[1][0].body as any[];
    const annotationOp = annotationBody[0];
    expect(annotationOp.op).toBe('add');
    expect(annotationOp.path).toBe('/metadata/annotations');
    expect(annotationOp.value).toMatchObject({
      'che.eclipse.org/tools-injector.opencode': 'true',
    });
  });

  it('adds specific annotation key when metadata.annotations already exists', async () => {
    const { getCustomObjectsApi } = await import('../../src/kube/client.js');

    const mockDw = {
      metadata: { annotations: { 'controller.devfile.io/started-at': '123' } },
      spec: {
        template: {
          components: [{ name: 'dev', container: { image: 'my-image' } }],
        },
      },
    };
    const patchSpy = vi.fn().mockResolvedValue({});

    vi.mocked(getCustomObjectsApi).mockReturnValue({
      getNamespacedCustomObject: vi.fn().mockResolvedValue(mockDw),
      patchNamespacedCustomObject: patchSpy,
    } as any);

    const { injectToolIntoWorkspace } = await import(
      '../../src/orchestrator/tool-injector.js'
    );
    await injectToolIntoWorkspace('my-workspace', 'opencode');

    // Second call adds the specific annotation key
    expect(patchSpy).toHaveBeenCalledTimes(2);
    const annotationBody = patchSpy.mock.calls[1][0].body as any[];
    const annotationOp = annotationBody[0];
    expect(annotationOp.op).toBe('add');
    expect(annotationOp.path).toContain('tools-injector');
    expect(annotationOp.path).toContain('opencode');
    expect(annotationOp.value).toBe('true');
  });

  it('skips both patches when tool is already injected (idempotency)', async () => {
    const { getCustomObjectsApi } = await import('../../src/kube/client.js');

    const mockDw = {
      spec: {
        template: {
          components: [
            { name: 'dev', container: { image: 'my-image' } },
            { name: 'opencode-injector', container: { image: 'some-image' } },
          ],
        },
      },
    };
    const patchSpy = vi.fn().mockResolvedValue({});

    vi.mocked(getCustomObjectsApi).mockReturnValue({
      getNamespacedCustomObject: vi.fn().mockResolvedValue(mockDw),
      patchNamespacedCustomObject: patchSpy,
    } as any);

    const { injectToolIntoWorkspace } = await import(
      '../../src/orchestrator/tool-injector.js'
    );
    await injectToolIntoWorkspace('my-workspace', 'opencode');

    // No patches should be sent when already injected
    expect(patchSpy).not.toHaveBeenCalled();
  });

  it('throws for unknown tool before calling the Kubernetes API', async () => {
    const { getCustomObjectsApi } = await import('../../src/kube/client.js');
    const getSpy = vi.fn();
    vi.mocked(getCustomObjectsApi).mockReturnValue({
      getNamespacedCustomObject: getSpy,
    } as any);

    const { injectToolIntoWorkspace } = await import(
      '../../src/orchestrator/tool-injector.js'
    );
    await expect(
      injectToolIntoWorkspace('my-workspace', 'bogus-tool'),
    ).rejects.toThrow('Unknown tool "bogus-tool"');

    expect(getSpy).not.toHaveBeenCalled();
  });
});
