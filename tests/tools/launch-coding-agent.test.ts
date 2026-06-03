import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../src/orchestrator/index.js');

describe('launchCodingAgentTool', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('returns launched status on success', async () => {
    const { launchCodingAgent } = await import(
      '../../src/orchestrator/index.js'
    );
    vi.mocked(launchCodingAgent).mockResolvedValue({
      status: 'launched',
      workspace: 'foo',
      session: 'agent',
    });

    const { launchCodingAgentTool } = await import(
      '../../src/tools/launch-coding-agent.js'
    );
    const result = await launchCodingAgentTool({
      workspace: 'foo',
      task: 'fix bug',
    });

    expect(result).toEqual({
      status: 'launched',
      workspace: 'foo',
      session: 'agent',
    });
    expect(launchCodingAgent).toHaveBeenCalledWith({
      workspace: 'foo',
      task: 'fix bug',
    });
  });

  it('propagates orchestrator errors', async () => {
    const { launchCodingAgent } = await import(
      '../../src/orchestrator/index.js'
    );
    vi.mocked(launchCodingAgent).mockRejectedValue(
      new Error('tool not installed'),
    );

    const { launchCodingAgentTool } = await import(
      '../../src/tools/launch-coding-agent.js'
    );
    await expect(
      launchCodingAgentTool({ workspace: 'foo', task: 'fix' }),
    ).rejects.toThrow('tool not installed');
  });

  it('passes system_prompt_file parameter to orchestrator', async () => {
    const { launchCodingAgent } = await import(
      '../../src/orchestrator/index.js'
    );
    vi.mocked(launchCodingAgent).mockResolvedValue({
      status: 'launched',
      workspace: 'foo',
      session: 'agent',
    });

    const { launchCodingAgentTool } = await import(
      '../../src/tools/launch-coding-agent.js'
    );
    const result = await launchCodingAgentTool({
      workspace: 'foo',
      task: 'fix bug',
      system_prompt_file: '/path/to/prompt.txt',
    });

    expect(result).toEqual({
      status: 'launched',
      workspace: 'foo',
      session: 'agent',
    });
    expect(launchCodingAgent).toHaveBeenCalledWith({
      workspace: 'foo',
      task: 'fix bug',
      system_prompt_file: '/path/to/prompt.txt',
    });
  });

  it('works without system_prompt_file for backward compatibility', async () => {
    const { launchCodingAgent } = await import(
      '../../src/orchestrator/index.js'
    );
    vi.mocked(launchCodingAgent).mockResolvedValue({
      status: 'launched',
      workspace: 'foo',
      session: 'agent',
    });

    const { launchCodingAgentTool } = await import(
      '../../src/tools/launch-coding-agent.js'
    );
    const result = await launchCodingAgentTool({
      workspace: 'foo',
      task: 'fix bug',
    });

    expect(result).toEqual({
      status: 'launched',
      workspace: 'foo',
      session: 'agent',
    });
    expect(launchCodingAgent).toHaveBeenCalledWith({
      workspace: 'foo',
      task: 'fix bug',
    });
  });

  it('passes session_id and working_directory to orchestrator', async () => {
    const { launchCodingAgent } = await import('../../src/orchestrator/index.js');
    vi.mocked(launchCodingAgent).mockResolvedValue({ status: 'launched', workspace: 'foo', session: 'custom-session' });

    const { launchCodingAgentTool } = await import('../../src/tools/launch-coding-agent.js');
    const result = await launchCodingAgentTool({
      workspace: 'foo',
      task: 'fix bug',
      session_id: 'custom-session',
      working_directory: '/projects/backend',
    });

    expect(result).toEqual({ status: 'launched', workspace: 'foo', session: 'custom-session' });
    expect(launchCodingAgent).toHaveBeenCalledWith({
      workspace: 'foo',
      task: 'fix bug',
      session_id: 'custom-session',
      working_directory: '/projects/backend',
    });
  });

  it('works with only session_id', async () => {
    const { launchCodingAgent } = await import('../../src/orchestrator/index.js');
    vi.mocked(launchCodingAgent).mockResolvedValue({ status: 'launched', workspace: 'foo', session: 'my-session' });

    const { launchCodingAgentTool } = await import('../../src/tools/launch-coding-agent.js');
    const result = await launchCodingAgentTool({
      workspace: 'foo',
      task: 'fix bug',
      session_id: 'my-session',
    });

    expect(result).toEqual({ status: 'launched', workspace: 'foo', session: 'my-session' });
    expect(launchCodingAgent).toHaveBeenCalledWith({
      workspace: 'foo',
      task: 'fix bug',
      session_id: 'my-session',
    });
  });

  it('works with only working_directory', async () => {
    const { launchCodingAgent } = await import('../../src/orchestrator/index.js');
    vi.mocked(launchCodingAgent).mockResolvedValue({ status: 'launched', workspace: 'foo', session: 'agent-12345' });

    const { launchCodingAgentTool } = await import('../../src/tools/launch-coding-agent.js');
    const result = await launchCodingAgentTool({
      workspace: 'foo',
      task: 'fix bug',
      working_directory: '/projects/frontend',
    });

    expect(result).toEqual({ status: 'launched', workspace: 'foo', session: 'agent-12345' });
    expect(launchCodingAgent).toHaveBeenCalledWith({
      workspace: 'foo',
      task: 'fix bug',
      working_directory: '/projects/frontend',
    });
  });
});
