import { sendMessageToAgent } from '../orchestrator/index.js';
export async function sendMessageToAgentTool(params: { workspace: string; session_id?: string; message: string }) {
  return sendMessageToAgent(params);
}
