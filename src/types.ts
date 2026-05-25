export interface WorkspaceInfo {
  name: string;
  phase: string;
  url: string;
  annotations: Record<string, string>;
}

export interface AgentState {
  session_alive: boolean;
  process_running: boolean;
  exit_code: number | null;
}

export type AgentPhase = 'running' | 'finished' | 'lost' | 'idle';

export interface AgentStatus {
  workspace: string;
  phase: AgentPhase;
  agent_type: string | null;
  task: string | null;
  launched_at: string | null;
  exit_code: number | null;
  last_output: string | null;
  ttyd_url: string | null;
}

export interface BackendEntry {
  required_tool: string;
  launch_command: (task: string, system_prompt_file?: string) => string;
}

export type ServerMode = 'orchestration' | 'full';

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export const AGENT_ANNOTATION_PREFIX = 'che.eclipse.org/agent-';

// Agent session annotation keys
export const ANN_SESSION = 'che.eclipse.org/agent-session';
export const ANN_TYPE = 'che.eclipse.org/agent-type';
export const ANN_TASK = 'che.eclipse.org/agent-task';
export const ANN_LAUNCHED = 'che.eclipse.org/agent-launched-at';

export const CHE_GATEWAY_CONTAINER = 'che-gateway';
export const DEFAULT_SESSION_NAME = 'agent';
export const DEFAULT_LINES = 50;
export const EXEC_TIMEOUT_MS = 10_000;
export const LAUNCH_TIMEOUT_MS = 30_000;
export const WORKSPACE_START_TIMEOUT_MS = 120_000;
export const AGENT_BASE_IMAGE = 'quay.io/che-incubator/agent-base-image:latest';
export const TMUX_HISTORY_LIMIT = 5000;
export const DEFAULT_EXEC_TIMEOUT_SECONDS = 10;
export const AGENT_TASK_MAX_BYTES = 2048;
export const EXEC_CAPTURE_LINES = 200;
