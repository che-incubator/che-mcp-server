import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../src/orchestrator/index.js');

describe('stopAgentTool', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('returns stopped: true with summary', async () => {
    const { stopAgent } = await import('../../src/orchestrator/index.js');
    vi.mocked(stopAgent).mockResolvedValue({
      stopped: true,
      summary: 'Task: fix bug\nExit code: 0\nLast output:\ndone',
    });

    const { stopAgentTool } = await import('../../src/tools/stop-agent.js');
    const result = await stopAgentTool({ workspace: 'foo' });

    expect(result.stopped).toBe(true);
    expect(result.summary).toContain('Exit code: 0');
  });

  it('returns stopped: true with null summary when no session was active', async () => {
    const { stopAgent } = await import('../../src/orchestrator/index.js');
    vi.mocked(stopAgent).mockResolvedValue({ stopped: true, summary: null });

    const { stopAgentTool } = await import('../../src/tools/stop-agent.js');
    const result = await stopAgentTool({ workspace: 'bar' });

    expect(result.stopped).toBe(true);
    expect(result.summary).toBeNull();
  });
});
