import { stopAgent } from '../orchestrator/index.js';
export async function stopAgentTool(params: { workspace: string; session_id?: string }) {
  return stopAgent(params);
}
