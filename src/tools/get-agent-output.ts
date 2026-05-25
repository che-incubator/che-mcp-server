import { getAgentOutput } from '../orchestrator/index.js';
export async function getAgentOutputTool(params: {
  workspace: string;
  lines?: number;
}) {
  return getAgentOutput(params);
}
