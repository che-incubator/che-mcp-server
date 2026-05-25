import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/kube/exec.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/kube/exec.js')>();
  return {
    ...actual,
    findPodForWorkspace: vi.fn(),
    selectContainer: vi.fn(),
    execInPod: vi.fn(),
  };
});

describe('startTerminalSession', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('creates session and returns success', async () => {
    const { findPodForWorkspace, selectContainer, execInPod } = await import(
      '../../src/kube/exec.js'
    );

    vi.mocked(findPodForWorkspace).mockResolvedValue({
      podName: 'workspace-pod-123',
      containers: ['dev-container', 'che-gateway'],
    });
    vi.mocked(selectContainer).mockReturnValue('dev-container');
    vi.mocked(execInPod)
      .mockResolvedValueOnce({
        stdout: '',
        stderr: "can't find session: agent",
        exitCode: 1,
      }) // has-session: not found
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // new-session
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // set-option remain-on-exit
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }); // set-option history-limit

    const { startTerminalSession } = await import(
      '../../src/tools/start-terminal-session.js'
    );
    const result = await startTerminalSession({ workspace: 'my-workspace' });

    expect(result).toEqual({ success: true, session_name: 'agent' });
    expect(execInPod).toHaveBeenCalledWith(
      'workspace-pod-123',
      'dev-container',
      ['tmux', 'new-session', '-d', '-s', 'agent', '-x', '200', '-y', '50'],
    );
    expect(execInPod).toHaveBeenCalledWith(
      'workspace-pod-123',
      'dev-container',
      ['tmux', 'set-option', '-t', 'agent', 'remain-on-exit', 'on'],
    );
    expect(execInPod).toHaveBeenCalledWith(
      'workspace-pod-123',
      'dev-container',
      ['tmux', 'set-option', '-t', 'agent', 'history-limit', '5000'],
    );
  });

  it('uses default session name "agent" when not specified', async () => {
    const { findPodForWorkspace, selectContainer, execInPod } = await import(
      '../../src/kube/exec.js'
    );

    vi.mocked(findPodForWorkspace).mockResolvedValue({
      podName: 'workspace-pod-123',
      containers: ['dev-container'],
    });
    vi.mocked(selectContainer).mockReturnValue('dev-container');
    vi.mocked(execInPod)
      .mockResolvedValueOnce({
        stdout: '',
        stderr: "can't find session",
        exitCode: 1,
      }) // has-session
      .mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }); // new-session + set-options

    const { startTerminalSession } = await import(
      '../../src/tools/start-terminal-session.js'
    );
    const result = await startTerminalSession({ workspace: 'my-workspace' });

    expect(result.session_name).toBe('agent');
  });

  it('throws when workspace is not Running', async () => {
    const { findPodForWorkspace, WorkspaceNotReadyError } = await import(
      '../../src/kube/exec.js'
    );

    vi.mocked(findPodForWorkspace).mockRejectedValue(
      new WorkspaceNotReadyError('my-workspace', 'Starting'),
    );

    const { startTerminalSession } = await import(
      '../../src/tools/start-terminal-session.js'
    );
    await expect(
      startTerminalSession({ workspace: 'my-workspace' }),
    ).rejects.toThrow('Workspace "my-workspace" is starting');
  });

  it('throws when session already exists', async () => {
    const { findPodForWorkspace, selectContainer, execInPod } = await import(
      '../../src/kube/exec.js'
    );

    vi.mocked(findPodForWorkspace).mockResolvedValue({
      podName: 'workspace-pod-123',
      containers: ['dev-container'],
    });
    vi.mocked(selectContainer).mockReturnValue('dev-container');
    vi.mocked(execInPod).mockResolvedValueOnce({
      stdout: '',
      stderr: '',
      exitCode: 0,
    }); // has-session: found

    const { startTerminalSession } = await import(
      '../../src/tools/start-terminal-session.js'
    );
    await expect(
      startTerminalSession({ workspace: 'my-workspace' }),
    ).rejects.toThrow(
      'Session "agent" already exists in workspace "my-workspace"',
    );
  });

  it('throws when tmux is not installed', async () => {
    const { findPodForWorkspace, selectContainer, execInPod } = await import(
      '../../src/kube/exec.js'
    );

    vi.mocked(findPodForWorkspace).mockResolvedValue({
      podName: 'workspace-pod-123',
      containers: ['dev-container'],
    });
    vi.mocked(selectContainer).mockReturnValue('dev-container');
    vi.mocked(execInPod)
      .mockResolvedValueOnce({
        stdout: '',
        stderr: "can't find session",
        exitCode: 1,
      }) // has-session: not found
      .mockResolvedValueOnce({
        stdout: '',
        stderr: 'tmux: not found',
        exitCode: 127,
      }); // new-session fails

    const { startTerminalSession } = await import(
      '../../src/tools/start-terminal-session.js'
    );
    await expect(
      startTerminalSession({ workspace: 'my-workspace' }),
    ).rejects.toThrow(
      'tmux not found in container. The workspace image must include tmux.',
    );
  });

  it('uses provided session_name when specified', async () => {
    const { findPodForWorkspace, selectContainer, execInPod } = await import(
      '../../src/kube/exec.js'
    );

    vi.mocked(findPodForWorkspace).mockResolvedValue({
      podName: 'workspace-pod-123',
      containers: ['dev-container'],
    });
    vi.mocked(selectContainer).mockReturnValue('dev-container');
    vi.mocked(execInPod)
      .mockResolvedValueOnce({
        stdout: '',
        stderr: "can't find session",
        exitCode: 1,
      }) // has-session: not found
      .mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }); // new-session + set-options

    const { startTerminalSession } = await import(
      '../../src/tools/start-terminal-session.js'
    );
    const result = await startTerminalSession({
      workspace: 'my-workspace',
      session_name: 'custom',
    });

    expect(result.session_name).toBe('custom');
    expect(execInPod).toHaveBeenCalledWith(
      'workspace-pod-123',
      'dev-container',
      ['tmux', 'new-session', '-d', '-s', 'custom', '-x', '200', '-y', '50'],
    );
  });
});
