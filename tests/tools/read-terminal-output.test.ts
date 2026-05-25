import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/kube/exec.js');

describe('readTerminalOutput', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('returns captured pane output as plain text', async () => {
    const { findPodForWorkspace, selectContainer, execInPod } = await import(
      '../../src/kube/exec.js'
    );

    vi.mocked(findPodForWorkspace).mockResolvedValue({
      podName: 'workspace-pod-123',
      containers: ['dev-container', 'che-gateway'],
    });
    vi.mocked(selectContainer).mockReturnValue('dev-container');
    vi.mocked(execInPod).mockResolvedValue({
      stdout: 'line1\nline2\nline3\n',
      stderr: '',
      exitCode: 0,
    });

    const { readTerminalOutput } = await import(
      '../../src/tools/read-terminal-output.js'
    );
    const result = await readTerminalOutput({
      workspace: 'my-workspace',
    });

    expect(result.output).toBe('line1\nline2\nline3\n');
    expect(result.lines_returned).toBe(3);
    expect(execInPod).toHaveBeenCalledWith(
      'workspace-pod-123',
      'dev-container',
      ['tmux', 'capture-pane', '-t', 'agent', '-p', '-S', '-50'],
    );
  });

  it('lines_returned reflects actual line count (not requested count)', async () => {
    const { findPodForWorkspace, selectContainer, execInPod } = await import(
      '../../src/kube/exec.js'
    );

    vi.mocked(findPodForWorkspace).mockResolvedValue({
      podName: 'workspace-pod-123',
      containers: ['dev-container'],
    });
    vi.mocked(selectContainer).mockReturnValue('dev-container');
    // Only 10 lines returned even though 50 requested
    vi.mocked(execInPod).mockResolvedValue({
      stdout:
        'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\n',
      stderr: '',
      exitCode: 0,
    });

    const { readTerminalOutput } = await import(
      '../../src/tools/read-terminal-output.js'
    );
    const result = await readTerminalOutput({
      workspace: 'my-workspace',
      lines: 50,
    });

    expect(result.lines_returned).toBe(10);
  });

  it('uses default 50 lines when not specified', async () => {
    const { findPodForWorkspace, selectContainer, execInPod } = await import(
      '../../src/kube/exec.js'
    );

    vi.mocked(findPodForWorkspace).mockResolvedValue({
      podName: 'workspace-pod-123',
      containers: ['dev-container'],
    });
    vi.mocked(selectContainer).mockReturnValue('dev-container');
    vi.mocked(execInPod).mockResolvedValue({
      stdout: 'output',
      stderr: '',
      exitCode: 0,
    });

    const { readTerminalOutput } = await import(
      '../../src/tools/read-terminal-output.js'
    );
    await readTerminalOutput({
      workspace: 'my-workspace',
    });

    expect(execInPod).toHaveBeenCalledWith(
      'workspace-pod-123',
      'dev-container',
      ['tmux', 'capture-pane', '-t', 'agent', '-p', '-S', '-50'],
    );
  });

  it('returns error when session does not exist', async () => {
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

    const { readTerminalOutput } = await import(
      '../../src/tools/read-terminal-output.js'
    );
    await expect(
      readTerminalOutput({
        workspace: 'my-workspace',
      }),
    ).rejects.toThrow('Session "agent" not found');
  });
});
