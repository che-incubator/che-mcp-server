import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/kube/exec.js');

describe('sendTerminalInput', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('sends text with literal flag -l', async () => {
    const { findPodForWorkspace, selectContainer, execInPod } = await import(
      '../../src/kube/exec.js'
    );

    vi.mocked(findPodForWorkspace).mockResolvedValue({
      podName: 'workspace-pod-123',
      containers: ['dev-container', 'che-gateway'],
    });
    vi.mocked(selectContainer).mockReturnValue('dev-container');
    vi.mocked(execInPod).mockResolvedValue({
      stdout: '',
      stderr: '',
      exitCode: 0,
    });

    const { sendTerminalInput } = await import(
      '../../src/tools/send-terminal-input.js'
    );
    await sendTerminalInput({
      workspace: 'my-workspace',
      text: 'hello world',
    });

    expect(execInPod).toHaveBeenCalledWith(
      'workspace-pod-123',
      'dev-container',
      ['tmux', 'send-keys', '-t', 'agent', '-l', 'hello world'],
    );
  });

  it('sends Enter when enter is true (default)', async () => {
    const { findPodForWorkspace, selectContainer, execInPod } = await import(
      '../../src/kube/exec.js'
    );

    vi.mocked(findPodForWorkspace).mockClear();
    vi.mocked(selectContainer).mockClear();
    vi.mocked(execInPod).mockClear();

    vi.mocked(findPodForWorkspace).mockResolvedValue({
      podName: 'workspace-pod-123',
      containers: ['dev-container'],
    });
    vi.mocked(selectContainer).mockReturnValue('dev-container');
    vi.mocked(execInPod).mockResolvedValue({
      stdout: '',
      stderr: '',
      exitCode: 0,
    });

    const { sendTerminalInput } = await import(
      '../../src/tools/send-terminal-input.js'
    );
    await sendTerminalInput({
      workspace: 'my-workspace',
      text: 'ls -la',
    });

    // Should be called twice: once for text, once for Enter
    expect(execInPod).toHaveBeenCalledTimes(2);
    expect(execInPod).toHaveBeenNthCalledWith(
      1,
      'workspace-pod-123',
      'dev-container',
      ['tmux', 'send-keys', '-t', 'agent', '-l', 'ls -la'],
    );
    expect(execInPod).toHaveBeenNthCalledWith(
      2,
      'workspace-pod-123',
      'dev-container',
      ['tmux', 'send-keys', '-t', 'agent', 'Enter'],
    );
  });

  it('does not send Enter when enter is false', async () => {
    const { findPodForWorkspace, selectContainer, execInPod } = await import(
      '../../src/kube/exec.js'
    );

    vi.mocked(findPodForWorkspace).mockClear();
    vi.mocked(selectContainer).mockClear();
    vi.mocked(execInPod).mockClear();

    vi.mocked(findPodForWorkspace).mockResolvedValue({
      podName: 'workspace-pod-123',
      containers: ['dev-container'],
    });
    vi.mocked(selectContainer).mockReturnValue('dev-container');
    vi.mocked(execInPod).mockResolvedValue({
      stdout: '',
      stderr: '',
      exitCode: 0,
    });

    const { sendTerminalInput } = await import(
      '../../src/tools/send-terminal-input.js'
    );
    await sendTerminalInput({
      workspace: 'my-workspace',
      text: 'partial command',
      enter: false,
    });

    // Should only be called once for text
    expect(execInPod).toHaveBeenCalledTimes(1);
    expect(execInPod).toHaveBeenCalledWith(
      'workspace-pod-123',
      'dev-container',
      ['tmux', 'send-keys', '-t', 'agent', '-l', 'partial command'],
    );
  });

  it('text with special characters (quotes, $, backticks) passed verbatim', async () => {
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
      stderr: '',
      exitCode: 0,
    });

    const { sendTerminalInput } = await import(
      '../../src/tools/send-terminal-input.js'
    );
    const specialText = 'echo "test" $HOME `date`';
    await sendTerminalInput({
      workspace: 'my-workspace',
      text: specialText,
      enter: false,
    });

    expect(execInPod).toHaveBeenCalledWith(
      'workspace-pod-123',
      'dev-container',
      ['tmux', 'send-keys', '-t', 'agent', '-l', specialText],
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

    const { sendTerminalInput } = await import(
      '../../src/tools/send-terminal-input.js'
    );
    await expect(
      sendTerminalInput({
        workspace: 'my-workspace',
        text: 'test',
      }),
    ).rejects.toThrow('Session "agent" not found');
  });
});
