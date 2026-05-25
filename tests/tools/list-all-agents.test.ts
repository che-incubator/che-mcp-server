import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../src/orchestrator/index.js');

const makePaginatedResult = (agents: any[]) => ({
  items: agents,
  total: agents.length,
  count: agents.length,
  offset: 0,
  has_more: false,
});

describe('listAllAgentsTool', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('returns all agent statuses', async () => {
    const { listAllAgents } = await import('../../src/orchestrator/index.js');
    vi.mocked(listAllAgents).mockResolvedValue(
      makePaginatedResult([
        {
          workspace: 'foo',
          phase: 'running',
          agent_type: 'claude-code',
          task: 'task A',
          launched_at: '2026-04-08T10:00:00Z',
          exit_code: null,
          last_output: null,
          ttyd_url: null,
        },
        {
          workspace: 'bar',
          phase: 'finished',
          agent_type: 'opencode',
          task: 'task B',
          launched_at: '2026-04-08T09:00:00Z',
          exit_code: 0,
          last_output: 'done',
          ttyd_url: null,
        },
      ]),
    );

    const { listAllAgentsTool } = await import(
      '../../src/tools/list-all-agents.js'
    );
    const result = await listAllAgentsTool();

    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.has_more).toBe(false);
    expect(result.items[0].workspace).toBe('foo');
    expect(result.items[1].phase).toBe('finished');
  });

  it('returns empty items when no agents active', async () => {
    const { listAllAgents } = await import('../../src/orchestrator/index.js');
    vi.mocked(listAllAgents).mockResolvedValue(makePaginatedResult([]));

    const { listAllAgentsTool } = await import(
      '../../src/tools/list-all-agents.js'
    );
    const result = await listAllAgentsTool();
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('passes limit and offset to listAllAgents', async () => {
    const { listAllAgents } = await import('../../src/orchestrator/index.js');
    vi.mocked(listAllAgents).mockResolvedValue(makePaginatedResult([]));

    const { listAllAgentsTool } = await import(
      '../../src/tools/list-all-agents.js'
    );
    await listAllAgentsTool({ limit: 10, offset: 5 });

    expect(listAllAgents).toHaveBeenCalledWith({ limit: 10, offset: 5 });
  });
});
