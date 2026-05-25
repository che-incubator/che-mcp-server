import { sendMessageToAgent } from '../orchestrator/index.js';
export async function sendMessageToAgentTool(params: {
  workspace: string;
  message: string;
}) {
  return sendMessageToAgent(params);
}
