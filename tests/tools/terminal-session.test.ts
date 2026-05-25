import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/kube/exec.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/kube/exec.js')>();
  return {
    ...actual,
    execInPod: vi.fn(),
  };
});

describe('ensureTerminalSession', () => {
  beforeEach(() => {
    vi.resetModules();
    // vi.clearAllMocks() is needed here because vi.resetModules() alone does not reset vi.fn() call counts
    // when the mock factory shares a reference — the same vi.fn() instance persists across tests.
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('creates session and returns true when no session exists', async () => {
    const { execInPod } = await import('../../src/kube/exec.js');

    vi.mocked(execInPod)
      .mockResolvedValueOnce({
        stdout: '',
        stderr: "can't find session: agent",
        exitCode: 1,
      }) // has-session: not found
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // new-session
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // set-option remain-on-exit
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }); // set-option history-limit

    const { ensureTerminalSession } = await import(
      '../../src/tools/terminal-session.js'
    );
    const created = await ensureTerminalSession(
      'pod-123',
      'dev-container',
      'agent',
    );

    expect(created).toBe(true);
    expect(execInPod).toHaveBeenNthCalledWith(1, 'pod-123', 'dev-container', [
      'tmux',
      'has-session',
      '-t',
      'agent',
    ]);
    expect(execInPod).toHaveBeenNthCalledWith(2, 'pod-123', 'dev-container', [
      'tmux',
      'new-session',
      '-d',
      '-s',
      'agent',
      '-x',
      '200',
      '-y',
      '50',
    ]);
    expect(execInPod).toHaveBeenNthCalledWith(3, 'pod-123', 'dev-container', [
      'tmux',
      'set-option',
      '-t',
      'agent',
      'remain-on-exit',
      'on',
    ]);
    expect(execInPod).toHaveBeenNthCalledWith(4, 'pod-123', 'dev-container', [
      'tmux',
      'set-option',
      '-t',
      'agent',
      'history-limit',
      '5000',
    ]);
  });

  it('returns false without creating when session already exists', async () => {
    const { execInPod } = await import('../../src/kube/exec.js');

    vi.mocked(execInPod).mockResolvedValueOnce({
      stdout: '',
      stderr: '',
      exitCode: 0,
    }); // has-session: found

    const { ensureTerminalSession } = await import(
      '../../src/tools/terminal-session.js'
    );
    const created = await ensureTerminalSession(
      'pod-123',
      'dev-container',
      'agent',
    );

    expect(created).toBe(false);
    expect(execInPod).toHaveBeenCalledTimes(1); // only has-session, no new-session
  });

  it('throws when tmux is not installed', async () => {
    const { execInPod } = await import('../../src/kube/exec.js');

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

    const { ensureTerminalSession } = await import(
      '../../src/tools/terminal-session.js'
    );
    await expect(
      ensureTerminalSession('pod-123', 'dev-container', 'agent'),
    ).rejects.toThrow(
      'tmux not found in container. The workspace image must include tmux.',
    );
  });

  it('throws on unexpected new-session failure', async () => {
    const { execInPod } = await import('../../src/kube/exec.js');

    vi.mocked(execInPod)
      .mockResolvedValueOnce({
        stdout: '',
        stderr: "can't find session",
        exitCode: 1,
      }) // has-session: not found
      .mockResolvedValueOnce({ stdout: '', stderr: 'some error', exitCode: 1 }); // new-session fails

    const { ensureTerminalSession } = await import(
      '../../src/tools/terminal-session.js'
    );
    await expect(
      ensureTerminalSession('pod-123', 'dev-container', 'agent'),
    ).rejects.toThrow('Failed to create tmux session: some error');
  });

  it('returns true even when set-option calls fail (session is still usable)', async () => {
    const { execInPod } = await import('../../src/kube/exec.js');

    vi.mocked(execInPod)
      .mockResolvedValueOnce({
        stdout: '',
        stderr: "can't find session",
        exitCode: 1,
      }) // has-session: not found
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // new-session succeeds
      .mockResolvedValueOnce({ stdout: '', stderr: 'error', exitCode: 1 }) // set-option remain-on-exit fails
      .mockResolvedValueOnce({ stdout: '', stderr: 'error', exitCode: 1 }); // set-option history-limit fails

    const { ensureTerminalSession } = await import(
      '../../src/tools/terminal-session.js'
    );
    const created = await ensureTerminalSession(
      'pod-123',
      'dev-container',
      'agent',
    );

    expect(created).toBe(true);
  });
});
