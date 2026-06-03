import { getWorkspaceStatus } from '../tools/get-workspace-status.js';
import { startWorkspace } from '../tools/start-workspace.js';
import { startTerminalSession } from '../tools/start-terminal-session.js';
import { sendTerminalInput } from '../tools/send-terminal-input.js';
import { readTerminalOutput } from '../tools/read-terminal-output.js';
import { getTerminalState } from '../tools/get-terminal-state.js';
import { stopTerminalSession } from '../tools/stop-terminal-session.js';
import { listWorkspaces } from '../tools/list-workspaces.js';
import { readAgentAnnotations, writeAgentAnnotations, clearAgentAnnotations, readAgentSessions, addAgentSession, removeAgentSession } from '../kube/annotations.js';
import { getBackendEntry, DEFAULT_AGENT_TYPE } from './backend-registry.js';
import { buildLaunchContext } from './launch-context.js';
import type { AgentStatus, AgentPhase, AgentSessionEntry } from '../types.js';
import { DEFAULT_SESSION_NAME, AGENT_TASK_MAX_BYTES, WORKSPACE_START_TIMEOUT_MS } from '../types.js';
import type { AgentAnnotationValues } from '../kube/annotations.js';

export async function launchCodingAgent(params: {
  workspace: string;
  task: string;
  agent_type?: string;
  system_prompt_file?: string;
  session_id?: string;
  working_directory?: string;
}): Promise<{ status: string; workspace: string; session: string }> {
  const { workspace, task, system_prompt_file, working_directory } = params;
  const agentType = params.agent_type ?? DEFAULT_AGENT_TYPE;
  const backend = getBackendEntry(agentType);
  const sessionId = params.session_id ?? `agent-${Date.now()}`;

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
        `- Create a new workspace with it: create_workspace(tools=['tmux', '${backend.required_tool}'])`,
    );
  }

  // 3. Guard against duplicate session_id
  const existingSessions = await readAgentSessions(workspace);
  const duplicate = existingSessions.find(s => s.session_id === sessionId);
  if (duplicate) {
    const state = await getTerminalState({ workspace, session_name: sessionId });
    if (state.session_alive) {
      throw new Error(
        `Session "${sessionId}" is already running in workspace "${workspace}".\n` +
        `Use a different session_id or stop the existing session first.`
      );
    }
    // Dead session — remove stale entry before re-launch
    await removeAgentSession(workspace, sessionId);
  }

  // 4. Start tmux session
  await startTerminalSession({ workspace, session_name: sessionId });

  // 5. Optionally cd to working_directory
  if (working_directory) {
    await sendTerminalInput({
      workspace,
      session_name: sessionId,
      text: `cd ${shellQuote(working_directory)}`,
      enter: true,
    });
  }

  // 6. Build and send launch context
  const prompt = buildLaunchContext({
    workspace,
    agentType,
    task,
    tools: toolsInstalled,
    workingDirectory: working_directory ?? '/projects',
  });
  await sendTerminalInput({
    workspace,
    text: backend.launch_command(prompt, system_prompt_file),
    session_name: sessionId,
    enter: true,
  });

  // 7. Persist session metadata
  await addAgentSession(workspace, {
    session_id: sessionId,
    backend: agentType,
    status: 'running',
    working_dir: working_directory ?? '/projects',
    task: task.slice(0, AGENT_TASK_MAX_BYTES),
    launched_at: new Date().toISOString(),
  });

  return { status: 'launched', workspace, session: sessionId };
}

export async function getAgentStatus(params: { workspace: string; session_id?: string }): Promise<AgentStatus> {
  const { workspace, session_id } = params;

  let sessionId: string;
  try {
    sessionId = await resolveSessionId(workspace, session_id);
  } catch (error) {
    // If no sessions exist and no session_id was provided, return idle
    if (!session_id && (error as Error).message.includes('No active agent session')) {
      const ann = await readAgentAnnotations(workspace);
      return makeStatus(workspace, 'idle', ann, null, null, null);
    }
    throw error;
  }

  const sessions = await readAgentSessions(workspace);
  const session = sessions.find(s => s.session_id === sessionId);
  if (!session) {
    throw new Error(`Session "${sessionId}" not found in workspace "${workspace}".`);
  }

  const state = await getTerminalState({ workspace, session_name: sessionId });

  if (!state.session_alive) {
    const ann: AgentAnnotationValues = {
      session: sessionId,
      agent_type: session.backend,
      task: session.task,
      launched_at: session.launched_at,
    };
    return makeStatus(workspace, 'lost', ann, null, null, null);
  }

  const { output } = await readTerminalOutput({ workspace, session_name: sessionId, lines: 20 });
  const ttydUrl = await getTtydUrl(workspace);

  const ann: AgentAnnotationValues = {
    session: sessionId,
    agent_type: session.backend,
    task: session.task,
    launched_at: session.launched_at,
  };

  if (state.process_running) {
    return makeStatus(workspace, 'running', ann, null, output, ttydUrl);
  }

  return makeStatus(
    workspace,
    'finished',
    ann,
    state.exit_code,
    output,
    ttydUrl,
  );
}

export async function listAllAgents(
  params: { limit?: number; offset?: number } = {},
): Promise<{
  items: AgentStatus[];
  total: number;
  count: number;
  offset: number;
  has_more: boolean;
}> {
  const { items: allWorkspaces } = await listWorkspaces({ limit: 10000 });

  const statusPromises: Promise<AgentStatus>[] = [];

  for (const ws of allWorkspaces) {
    let sessions: AgentSessionEntry[];
    try {
      sessions = await readAgentSessions(ws.name);
    } catch {
      continue;
    }

    for (const session of sessions) {
      statusPromises.push(
        getAgentStatus({ workspace: ws.name, session_id: session.session_id })
          .catch((): AgentStatus => ({
            workspace: ws.name,
            phase: 'lost',
            agent_type: session.backend,
            task: session.task,
            launched_at: session.launched_at,
            exit_code: null,
            last_output: null,
            ttyd_url: null,
          }))
      );
    }
  }

  const allAgents = await Promise.all(statusPromises);
  const total = allAgents.length;
  const offset = params.offset ?? 0;
  const limit = params.limit ?? 50;
  const items = allAgents.slice(offset, offset + limit);
  return {
    items,
    total,
    count: items.length,
    offset,
    has_more: offset + limit < total,
  };
}

export async function sendMessageToAgent(params: {
  workspace: string;
  session_id?: string;
  message: string;
}): Promise<{ acknowledged: boolean }> {
  const { workspace, session_id, message } = params;
  const sessionId = await resolveSessionId(workspace, session_id);
  await sendTerminalInput({
    workspace,
    text: message,
    session_name: sessionId,
    enter: true,
  });
  return { acknowledged: true };
}

export async function getAgentOutput(params: {
  workspace: string;
  session_id?: string;
  lines?: number;
}): Promise<{ output: string; lines_returned: number }> {
  const { workspace, session_id, lines } = params;
  const sessionId = await resolveSessionId(workspace, session_id);
  return readTerminalOutput({
    workspace,
    session_name: sessionId,
    lines,
  });
}

export async function stopAgent(params: { workspace: string; session_id?: string }): Promise<{
  stopped: boolean;
  summary: string | null;
}> {
  const { workspace, session_id } = params;

  let sessionId: string;
  try {
    sessionId = await resolveSessionId(workspace, session_id);
  } catch (error) {
    // If no sessions exist, nothing to stop
    if (!session_id && (error as Error).message.includes('No active agent session')) {
      return { stopped: true, summary: null };
    }
    throw error;
  }

  const sessions = await readAgentSessions(workspace);
  const session = sessions.find(s => s.session_id === sessionId);
  if (!session) {
    throw new Error(`Session "${sessionId}" not found in workspace "${workspace}".`);
  }

  let summary: string | null = null;
  try {
    const { output } = await readTerminalOutput({ workspace, session_name: sessionId, lines: 50 });
    const state = await getTerminalState({ workspace, session_name: sessionId });
    summary = buildStopSummary({ output, exitCode: state.exit_code, task: session.task });
    await stopTerminalSession({ workspace, session_name: sessionId });
  } catch {
    // session may already be gone
  }

  await removeAgentSession(workspace, sessionId);
  return { stopped: true, summary };
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function resolveSessionId(workspace: string, session_id?: string): Promise<string> {
  if (session_id) return session_id;

  const sessions = await readAgentSessions(workspace);
  if (sessions.length === 0) {
    throw new Error(`No active agent session in workspace "${workspace}".`);
  }
  if (sessions.length === 1) {
    return sessions[0].session_id;
  }
  throw new Error(
    `Workspace "${workspace}" has ${sessions.length} agent sessions. ` +
    `Specify session_id. Active sessions: ${sessions.map(s => s.session_id).join(', ')}`
  );
}

function shellQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

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
        `Workspace "${workspace}" did not reach Running state within ${WORKSPACE_START_TIMEOUT_MS / 1000}s.`,
      );
    }
    await sleep(3000);
  }
}

function parseInstalledTools(annotations: Record<string, string>): string[] {
  const prefix = 'che.eclipse.org/tools-injector.';
  return Object.keys(annotations)
    .filter((k) => k.startsWith(prefix))
    .map((k) => k.slice(prefix.length));
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
  const exitStr =
    params.exitCode !== null
      ? `Exit code: ${params.exitCode}`
      : 'Still running (force stopped)';
  return [
    `Task: ${params.task ?? '(unknown)'}`,
    exitStr,
    `Last output:\n${excerpt}`,
  ].join('\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
