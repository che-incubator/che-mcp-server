import { describe, it, expect } from 'vitest';
import { ANN_SESSIONS } from '../src/types.js';
import type { AgentSessionEntry } from '../src/types.js';

describe('multi-session types', () => {
  it('exports ANN_SESSIONS constant', () => {
    expect(ANN_SESSIONS).toBe('che.eclipse.org/agent-sessions');
  });

  it('AgentSessionEntry is usable as a type', () => {
    const entry: AgentSessionEntry = {
      session_id: 'agent-1',
      backend: 'claude-code',
      status: 'running',
      working_dir: '/projects/repo-a',
      task: 'fix bug',
      launched_at: '2026-06-03T10:00:00Z',
    };
    expect(entry.session_id).toBe('agent-1');
  });
});
