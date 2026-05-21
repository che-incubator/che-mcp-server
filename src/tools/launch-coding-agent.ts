import { launchCodingAgent } from '../orchestrator/index.js';

interface Params {
  workspace: string;
  task: string;
  agent_type?: string;
  system_prompt_file?: string;
}

export async function launchCodingAgentTool(params: Params) {
  return launchCodingAgent(params);
}
