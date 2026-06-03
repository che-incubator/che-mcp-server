import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Module-level mocks ──────────────────────────────────────────────────────

vi.mock('../../src/kube/client.js', () => ({
  getCustomObjectsApi: vi.fn(),
  getNamespace: vi.fn().mockReturnValue('test-namespace'),
}));

const mockGetWorkspaceStatus = vi.fn();
const mockStartWorkspace = vi.fn();
const mockStartTerminalSession = vi.fn();
const mockSendTerminalInput = vi.fn();
const mockGetTerminalState = vi.fn();

vi.mock('../../src/tools/get-workspace-status.js', () => ({
  getWorkspaceStatus: (...args: any[]) => mockGetWorkspaceStatus(...args),
}));
vi.mock('../../src/tools/start-workspace.js', () => ({
  startWorkspace: (...args: any[]) => mockStartWorkspace(...args),
}));
vi.mock('../../src/tools/start-terminal-session.js', () => ({
  startTerminalSession: (...args: any[]) => mockStartTerminalSession(...args),
}));
vi.mock('../../src/tools/send-terminal-input.js', () => ({
  sendTerminalInput: (...args: any[]) => mockSendTerminalInput(...args),
}));
vi.mock('../../src/tools/get-terminal-state.js', () => ({
  getTerminalState: (...args: any[]) => mockGetTerminalState(...args),
}));
vi.mock('../../src/tools/read-terminal-output.js', () => ({
  readTerminalOutput: vi.fn(),
}));
vi.mock('../../src/tools/stop-terminal-session.js', () => ({
  stopTerminalSession: vi.fn(),
}));
vi.mock('../../src/tools/list-workspaces.js', () => ({
  listWorkspaces: vi.fn(),
}));

const mockReadAgentSessions = vi.fn();
const mockAddAgentSession = vi.fn();
const mockRemoveAgentSession = vi.fn();

vi.mock('../../src/kube/annotations.js', () => ({
  readAgentAnnotations: vi.fn().mockResolvedValue({}),
  writeAgentAnnotations: vi.fn(),
  clearAgentAnnotations: vi.fn(),
  readAgentSessions: (...args: any[]) => mockReadAgentSessions(...args),
  addAgentSession: (...args: any[]) => mockAddAgentSession(...args),
  removeAgentSession: (...args: any[]) => mockRemoveAgentSession(...args),
  writeAgentSessions: vi.fn(),
}));

vi.mock('../../src/orchestrator/launch-context.js', () => ({
  buildLaunchContext: vi.fn().mockReturnValue('mock-prompt'),
}));

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('launchCodingAgent — stale session cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: workspace is running with claude-code installed
    mockGetWorkspaceStatus.mockResolvedValue({
      phase: 'Running',
      annotations: { 'che.eclipse.org/tools-injector.claude-code': 'true' },
    });
    mockStartTerminalSession.mockResolvedValue({});
    mockSendTerminalInput.mockResolvedValue({});
    mockAddAgentSession.mockResolvedValue(undefined);
    mockRemoveAgentSession.mockResolvedValue(undefined);
  });

  it('removes stale session entry before re-launching with the same session_id', async () => {
    const staleEntry = {
      session_id: 'agent-123',
      backend: 'claude-code',
      status: 'running',
      working_dir: '/projects',
      task: 'old task',
      launched_at: '2026-01-01T00:00:00.000Z',
    };

    // readAgentSessions returns a stale entry with the same session_id
    mockReadAgentSessions.mockResolvedValue([staleEntry]);

    // getTerminalState reports the session is dead
    mockGetTerminalState.mockResolvedValue({
      session_alive: false,
      process_running: false,
      exit_code: 0,
    });

    const { launchCodingAgent } = await import('../../src/orchestrator/index.js');

    await launchCodingAgent({
      workspace: 'my-workspace',
      task: 'new task',
      session_id: 'agent-123',
    });

    // Must remove the stale entry before adding the new one
    expect(mockRemoveAgentSession).toHaveBeenCalledWith('my-workspace', 'agent-123');
    expect(mockAddAgentSession).toHaveBeenCalledWith(
      'my-workspace',
      expect.objectContaining({ session_id: 'agent-123', task: 'new task' }),
    );

    // removeAgentSession must be called before addAgentSession
    const removeOrder = mockRemoveAgentSession.mock.invocationCallOrder[0];
    const addOrder = mockAddAgentSession.mock.invocationCallOrder[0];
    expect(removeOrder).toBeLessThan(addOrder);
  });

  it('does not call removeAgentSession when there is no duplicate', async () => {
    // No existing sessions
    mockReadAgentSessions.mockResolvedValue([]);

    const { launchCodingAgent } = await import('../../src/orchestrator/index.js');

    await launchCodingAgent({
      workspace: 'my-workspace',
      task: 'fresh task',
      session_id: 'agent-new',
    });

    expect(mockRemoveAgentSession).not.toHaveBeenCalled();
    expect(mockAddAgentSession).toHaveBeenCalledWith(
      'my-workspace',
      expect.objectContaining({ session_id: 'agent-new' }),
    );
  });

  it('throws when duplicate session is still alive', async () => {
    const aliveEntry = {
      session_id: 'agent-alive',
      backend: 'claude-code',
      status: 'running',
      working_dir: '/projects',
      task: 'running task',
      launched_at: '2026-01-01T00:00:00.000Z',
    };

    mockReadAgentSessions.mockResolvedValue([aliveEntry]);
    mockGetTerminalState.mockResolvedValue({
      session_alive: true,
      process_running: true,
      exit_code: null,
    });

    const { launchCodingAgent } = await import('../../src/orchestrator/index.js');

    await expect(
      launchCodingAgent({
        workspace: 'my-workspace',
        task: 'conflicting task',
        session_id: 'agent-alive',
      }),
    ).rejects.toThrow('already running');

    // Must not remove or add sessions
    expect(mockRemoveAgentSession).not.toHaveBeenCalled();
    expect(mockAddAgentSession).not.toHaveBeenCalled();
  });
});
