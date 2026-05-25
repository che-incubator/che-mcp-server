import { listAllAgents } from '../orchestrator/index.js';
export async function listAllAgentsTool(
  params: { limit?: number; offset?: number } = {},
) {
  return listAllAgents(params);
}
