import type { BackendEntry } from '../types.js';

export const BACKEND_REGISTRY: Record<string, BackendEntry> = {
  'claude-code': {
    required_tool: 'claude-code',
    // --dangerously-skip-permissions: required for unattended operation in a tmux session.
    // Without it, claude-code pauses and prompts for permission on every tool use,
    // blocking indefinitely with no keyboard to respond.
    launch_command: (task: string, system_prompt_file?: string) => {
      const systemPromptArg = system_prompt_file
        ? `--append-system-prompt-file ${shellQuote(system_prompt_file)} `
        : '';
      return `claude --dangerously-skip-permissions ${systemPromptArg}-p ${shellQuote(task)}`;
    },
  },
  opencode: {
    required_tool: 'opencode',
    // opencode run: non-interactive batch mode.
    // --format json: emits persistent JSON event lines instead of a TUI that clears on exit,
    //   making get_agent_output readable after completion.
    // -m: model is required; without it opencode shows a TUI picker and blocks forever.
    //   Uses ${OPENCODE_DEFAULT_MODEL:-google/gemini-2.5-flash} so the workspace can override
    //   via env var, falling back to gemini-2.5-flash (matches the GEMINI_API_KEY present
    //   in agent workspaces). Double-quoted so bash expands the variable at runtime.
    // --dir /projects: sets the project root so writes inside /projects need no permission.
    // Without it, opencode auto-rejects all file writes as "external_directory".
    launch_command: (task: string, _system_prompt_file?: string) =>
      `opencode run --format json --dir /projects -m "\${OPENCODE_DEFAULT_MODEL:-google/gemini-2.5-flash}" ${shellQuote(task)}`,
  },
  'gemini-cli': {
    required_tool: 'gemini-cli',
    // -y / --yolo: auto-approve all tool actions. Without it, gemini-cli prompts for
    // confirmation on file edits and shell commands, blocking in unattended mode.
    launch_command: (task: string, _system_prompt_file?: string) =>
      `gemini -y -p ${shellQuote(task)}`,
  },
};

export const DEFAULT_AGENT_TYPE = 'claude-code';

export function getBackendEntry(agentType: string): BackendEntry {
  const entry = BACKEND_REGISTRY[agentType];
  if (!entry) {
    throw new Error(
      `Unknown agent_type "${agentType}". Supported: ${Object.keys(BACKEND_REGISTRY).join(', ')}`,
    );
  }
  return entry;
}

function shellQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}
