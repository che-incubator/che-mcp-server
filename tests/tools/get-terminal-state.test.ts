import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/kube/exec.js');

describe('getTerminalState', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('returns session_alive: true, process_running: true when pane is active', async () => {
    const { findPodForWorkspace, selectContainer, execInPod } = await import(
      '../../src/kube/exec.js'
    );

    vi.mocked(findPodForWorkspace).mockResolvedValue({
      podName: 'workspace-pod-123',
      containers: ['dev-container', 'che-gateway'],
    });
    vi.mocked(selectContainer).mockReturnValue('dev-container');
    vi.mocked(execInPod).mockResolvedValue({
      stdout: '12345 0 claude ',
      stderr: '',
      exitCode: 0,
    });

    const { getTerminalState } = await import(
      '../../src/tools/get-terminal-state.js'
    );
    const result = await getTerminalState({
      workspace: 'my-workspace',
    });

    expect(result).toEqual({
      session_alive: true,
      process_running: true,
      exit_code: null,
    });
    expect(execInPod).toHaveBeenCalledWith(
      'workspace-pod-123',
      'dev-container',
      [
        'tmux',
        'list-panes',
        '-t',
        'agent',
        '-F',
        '#{pane_pid} #{pane_dead} #{pane_current_command} #{pane_dead_status}',
      ],
    );
  });

  it('returns session_alive: true, process_running: false with exit code 0', async () => {
    const { findPodForWorkspace, selectContainer, execInPod } = await import(
      '../../src/kube/exec.js'
    );

    vi.mocked(findPodForWorkspace).mockResolvedValue({
      podName: 'workspace-pod-123',
      containers: ['dev-container'],
    });
    vi.mocked(selectContainer).mockReturnValue('dev-container');
    vi.mocked(execInPod).mockResolvedValue({
      stdout: '12345 1 bash 0',
      stderr: '',
      exitCode: 0,
    });

    const { getTerminalState } = await import(
      '../../src/tools/get-terminal-state.js'
    );
    const result = await getTerminalState({
      workspace: 'my-workspace',
    });

    expect(result).toEqual({
      session_alive: true,
      process_running: false,
      exit_code: 0,
    });
  });

  it('returns non-zero exit code when process failed', async () => {
    const { findPodForWorkspace, selectContainer, execInPod } = await import(
      '../../src/kube/exec.js'
    );

    vi.mocked(findPodForWorkspace).mockResolvedValue({
      podName: 'workspace-pod-123',
      containers: ['dev-container'],
    });
    vi.mocked(selectContainer).mockReturnValue('dev-container');
    vi.mocked(execInPod).mockResolvedValue({
      stdout: '12345 1 bash 1',
      stderr: '',
      exitCode: 0,
    });

    const { getTerminalState } = await import(
      '../../src/tools/get-terminal-state.js'
    );
    const result = await getTerminalState({
      workspace: 'my-workspace',
    });

    expect(result).toEqual({
      session_alive: true,
      process_running: false,
      exit_code: 1,
    });
  });

  it('returns session_alive: false when session does not exist', async () => {
    const { findPodForWorkspace, selectContainer, execInPod } = await import(
      '../../src/kube/exec.js'
    );

    vi.mocked(findPodForWorkspace).mockResolvedValue({
      podName: 'workspace-pod-123',
      containers: ['dev-container'],
    });
    vi.mocked(selectContainer).mockReturnValue('dev-container');
    vi.mocked(execInPod).mockResolvedValue({
      stdout: '',
      stderr: "can't find session: agent",
      exitCode: 1,
    });

    const { getTerminalState } = await import(
      '../../src/tools/get-terminal-state.js'
    );
    const result = await getTerminalState({
      workspace: 'my-workspace',
    });

    expect(result).toEqual({
      session_alive: false,
      process_running: false,
      exit_code: null,
    });
  });
});
