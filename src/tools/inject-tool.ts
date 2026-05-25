import {
  validateTool,
  injectToolIntoWorkspace,
} from '../orchestrator/tool-injector.js';

interface InjectToolParams {
  workspace: string;
  tool: string;
}

export async function injectTool(params: InjectToolParams): Promise<{
  injected: boolean;
  restart_required: boolean;
  message: string;
}> {
  validateTool(params.tool);
  await injectToolIntoWorkspace(params.workspace, params.tool);
  return {
    injected: true,
    restart_required: true,
    message: `Tool "${params.tool}" injected into workspace "${params.workspace}". Workspace will restart to apply the change.`,
  };
}
