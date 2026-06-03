import { getAgentStatus } from '../orchestrator/index.js';
import type { AgentStatus } from '../types.js';

export async function getAgentStatusTool(params: { workspace: string; session_id?: string }): Promise<AgentStatus> {
  return getAgentStatus(params);
}
