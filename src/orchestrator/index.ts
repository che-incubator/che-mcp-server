import { getWorkspaceStatus } from '../tools/get-workspace-status.js';
import { startWorkspace } from '../tools/start-workspace.js';
import { startTerminalSession } from '../tools/start-terminal-session.js';
import { sendTerminalInput } from '../tools/send-terminal-input.js';
import { readTerminalOutput } from '../tools/read-terminal-output.js';
import { getTerminalState } from '../tools/get-terminal-state.js';
import { stopTerminalSession } from '../tools/stop-terminal-session.js';
import { listWorkspaces } from '../tools/list-workspaces.js';
import { readAgentAnnotations, writeAgentAnnotations, clearAgentAnnotations } from '../kube/annotations.js';
import { getBackendEntry, DEFAULT_AGENT_TYPE } from './backend-registry.js';
import { buildLaunchContext } from './launch-context.js';
import type { AgentStatus, AgentPhase } from '../types.js';
import { DEFAULT_SESSION_NAME, AGENT_TASK_MAX_BYTES, WORKSPACE_START_TIMEOUT_MS } from '../types.js';
import type { AgentAnnotationValues } from '../kube/annotations.js';

export async function launchCodingAgent(params: {
  workspace: string;
  task: string;
  agent_type?: string;
  system_prompt_file?: string;
}): Promise<{ status: string; workspace: string; session: string }> {
  const { workspace, task, system_prompt_file } = params;
  const agentType = params.agent_type ?? DEFAULT_AGENT_TYPE;
  const backend = getBackendEntry(agentType);

  // 1. Ensure workspace is running
  await ensureWorkspaceRunning(workspace);

  // 2. Check required tool is installed (tools-injector writes annotations)
  const wsStatus = await getWorkspaceStatus({ workspace });
  const toolsInstalled = parseInstalledTools(wsStatus.annotations);
  if (!toolsInstalled.includes(backend.required_tool)) {
    throw new Error(
      `Workspace "${workspace}" does not have ${backend.required_tool} installed.\n` +
      `Options:\n` +
      `- Inject now (requires workspace restart): inject_tool(workspace='${workspace}', tool='${backend.required_tool}')\n` +
      `- Create a new workspace with it: create_workspace(tools=['tmux', '${backend.required_tool}'])`
    );
  }

  // 3. Guard against double-launch
  const existing = await readAgentAnnotations(workspace);
  if (existing.session) {
    const state = await getTerminalState({ workspace, session_name: existing.session });
    if (state.session_alive) {
      throw new Error(
        `Workspace "${workspace}" already has a running agent session.\n` +
        `Use get_agent_status('${workspace}') to check it, or stop_agent('${workspace}') first.`
      );
    }
  }

  // 4. Start tmux session
  await startTerminalSession({ workspace, session_name: DEFAULT_SESSION_NAME });

  // 5. Build and send launch context
  const prompt = buildLaunchContext({
    workspace,
    agentType,
    task,
    tools: toolsInstalled,
  });
  await sendTerminalInput({
    workspace,
    text: backend.launch_command(prompt, system_prompt_file),
    session_name: DEFAULT_SESSION_NAME,
    enter: true,
  });

  // 6. Persist intent annotations
  await writeAgentAnnotations(workspace, {
    session: DEFAULT_SESSION_NAME,
    agent_type: agentType,
    task: task.slice(0, AGENT_TASK_MAX_BYTES),
    launched_at: new Date().toISOString(),
  });

  return { status: 'launched', workspace, session: DEFAULT_SESSION_NAME };
}

export async function getAgentStatus(params: { workspace: string }): Promise<AgentStatus> {
  const { workspace } = params;
  const ann = await readAgentAnnotations(workspace);

  if (!ann.session) {
    return makeStatus(workspace, 'idle', ann, null, null, null);
  }

  const state = await getTerminalState({ workspace, session_name: ann.session });

  if (!state.session_alive) {
    return makeStatus(workspace, 'lost', ann, null, null, null);
  }

  const { output } = await readTerminalOutput({ workspace, session_name: ann.session, lines: 20 });
  const ttydUrl = await getTtydUrl(workspace);

  if (state.process_running) {
    return makeStatus(workspace, 'running', ann, null, output, ttydUrl);
  }

  return makeStatus(workspace, 'finished', ann, state.exit_code, output, ttydUrl);
}

export async function listAllAgents(params: { limit?: number; offset?: number } = {}): Promise<{
  items: AgentStatus[];
  total: number;
  count: number;
  offset: number;
  has_more: boolean;
}> {
  // Fetch all workspaces (no pagination — we need the full list to filter by annotation)
  const { items: allWorkspaces } = await listWorkspaces({ limit: 10000 });
  const withSession = allWorkspaces.filter(
    w => w.annotations['che.eclipse.org/agent-session'],
  );

  const results = await Promise.allSettled(
    withSession.map(w => getAgentStatus({ workspace: w.name })),
  );

  const allAgents = results
    .filter((r): r is PromiseFulfilledResult<AgentStatus> => r.status === 'fulfilled')
    .map(r => r.value);

  const total = allAgents.length;
  const offset = params.offset ?? 0;
  const limit = params.limit ?? 50;
  const items = allAgents.slice(offset, offset + limit);
  return { items, total, count: items.length, offset, has_more: offset + limit < total };
}

export async function sendMessageToAgent(params: {
  workspace: string;
  message: string;
}): Promise<{ acknowledged: boolean }> {
  const ann = await readAgentAnnotations(params.workspace);
  if (!ann.session) {
    throw new Error(`No active agent session in workspace "${params.workspace}".`);
  }
  await sendTerminalInput({
    workspace: params.workspace,
    text: params.message,
    session_name: ann.session,
    enter: true,
  });
  return { acknowledged: true };
}

export async function getAgentOutput(params: {
  workspace: string;
  lines?: number;
}): Promise<{ output: string; lines_returned: number }> {
  const ann = await readAgentAnnotations(params.workspace);
  if (!ann.session) {
    throw new Error(`No active agent session in workspace "${params.workspace}".`);
  }
  return readTerminalOutput({
    workspace: params.workspace,
    session_name: ann.session,
    lines: params.lines,
  });
}

export async function stopAgent(params: { workspace: string }): Promise<{
  stopped: boolean;
  summary: string | null;
}> {
  const { workspace } = params;
  const ann = await readAgentAnnotations(workspace);

  let summary: string | null = null;
  if (ann.session) {
    try {
      const { output } = await readTerminalOutput({ workspace, session_name: ann.session, lines: 50 });
      const state = await getTerminalState({ workspace, session_name: ann.session });
      summary = buildStopSummary({ output, exitCode: state.exit_code, task: ann.task });
      await stopTerminalSession({ workspace, session_name: ann.session });
    } catch {
      // session may already be gone
    }
  }

  await clearAgentAnnotations(workspace);
  return { stopped: true, summary };
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function ensureWorkspaceRunning(workspace: string): Promise<void> {
  const deadline = Date.now() + WORKSPACE_START_TIMEOUT_MS;

  while (true) {
    const status = await getWorkspaceStatus({ workspace });
    if (status.phase === 'Running') return;
    if (status.phase === 'Failed') {
      throw new Error(`Workspace "${workspace}" failed to start.`);
    }
    if (status.phase === 'Stopped') {
      await startWorkspace({ workspace });
    }
    if (Date.now() > deadline) {
      throw new Error(
        `Workspace "${workspace}" did not reach Running state within ${WORKSPACE_START_TIMEOUT_MS / 1000}s.`
      );
    }
    await sleep(3000);
  }
}

function parseInstalledTools(annotations: Record<string, string>): string[] {
  const prefix = 'che.eclipse.org/tools-injector.';
  return Object.keys(annotations)
    .filter(k => k.startsWith(prefix))
    .map(k => k.slice(prefix.length));
}

async function getTtydUrl(workspace: string): Promise<string | null> {
  try {
    const status = await getWorkspaceStatus({ workspace });
    return status.mainUrl ?? null;
  } catch {
    return null;
  }
}

function makeStatus(
  workspace: string,
  phase: AgentPhase,
  ann: AgentAnnotationValues,
  exit_code: number | null,
  last_output: string | null,
  ttyd_url: string | null,
): AgentStatus {
  return {
    workspace,
    phase,
    agent_type: ann.agent_type,
    task: ann.task,
    launched_at: ann.launched_at,
    exit_code,
    last_output,
    ttyd_url,
  };
}

function buildStopSummary(params: {
  output: string;
  exitCode: number | null;
  task: string | null;
}): string {
  const lines = params.output.trim().split('\n');
  const excerpt = lines.slice(-10).join('\n');
  const exitStr = params.exitCode !== null
    ? `Exit code: ${params.exitCode}`
    : 'Still running (force stopped)';
  return [
    `Task: ${params.task ?? '(unknown)'}`,
    exitStr,
    `Last output:\n${excerpt}`,
  ].join('\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
