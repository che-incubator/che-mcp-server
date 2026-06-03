import { getCoreV1Api, getNamespace } from '../kube/client.js';
import { findPodForWorkspace } from '../kube/exec.js';
import { readAgentSessions, removeAgentSession } from '../kube/annotations.js';
import { getTerminalState } from './get-terminal-state.js';

export interface WorkspaceCapacity {
  workspace: string;
  memory_limit_gi: number;
  cpu_limit: number;
  running_agents: number;
  max_agents: number;
  available_slots: number;
}

const DEFAULT_MEMORY_PER_AGENT_GI = 2;

export async function getWorkspaceCapacity(params: {
  workspace?: string;
}): Promise<WorkspaceCapacity | WorkspaceCapacity[]> {
  if (params.workspace) {
    return getCapacityForWorkspace(params.workspace);
  }

  const { listWorkspaces } = await import('./list-workspaces.js');
  const { items: allWorkspaces } = await listWorkspaces({ limit: 10000 });
  const runningWorkspaces = allWorkspaces.filter((w: any) => w.phase === 'Running');

  const results = await Promise.allSettled(
    runningWorkspaces.map((w: any) => getCapacityForWorkspace(w.name)),
  );

  return results
    .filter((r): r is PromiseFulfilledResult<WorkspaceCapacity> => r.status === 'fulfilled')
    .map(r => r.value);
}

async function getCapacityForWorkspace(workspace: string): Promise<WorkspaceCapacity> {
  const { podName } = await findPodForWorkspace(workspace);
  const coreApi = getCoreV1Api();
  const ns = getNamespace();

  const pod = await coreApi.readNamespacedPod({ name: podName, namespace: ns });

  let totalMemoryBytes = 0;
  let totalCpuMillis = 0;

  for (const container of (pod as any).spec?.containers ?? []) {
    if (container.name === 'che-gateway') continue;
    const limits = container.resources?.limits;
    if (limits) {
      if (limits['memory']) {
        totalMemoryBytes += parseMemory(limits['memory'] as string);
      }
      if (limits['cpu']) {
        totalCpuMillis += parseCpu(limits['cpu'] as string);
      }
    }
  }

  const memoryGi = totalMemoryBytes / (1024 * 1024 * 1024);
  const cpuCores = totalCpuMillis / 1000;

  const sessions = await readAgentSessions(workspace);

  // Check each session's tmux liveness; prune dead entries
  const livenessChecks = await Promise.allSettled(
    sessions.map(async (session) => {
      const state = await getTerminalState({ workspace, session_name: session.session_id });
      return { session, alive: state.session_alive };
    }),
  );

  let runningAgents = 0;
  for (const result of livenessChecks) {
    if (result.status === 'rejected') {
      // Conservative: count as alive if we couldn't check
      runningAgents++;
    } else if (result.value.alive) {
      runningAgents++;
    } else {
      // Dead session — clean up stale annotation entry
      removeAgentSession(workspace, result.value.session.session_id).catch(() => {});
    }
  }

  const maxAgents = Math.floor(memoryGi / DEFAULT_MEMORY_PER_AGENT_GI);
  const availableSlots = Math.max(0, maxAgents - runningAgents);

  return {
    workspace,
    memory_limit_gi: Math.round(memoryGi * 100) / 100,
    cpu_limit: Math.round(cpuCores * 100) / 100,
    running_agents: runningAgents,
    max_agents: maxAgents,
    available_slots: availableSlots,
  };
}

function parseMemory(value: string): number {
  const match = value.match(/^(\d+(?:\.\d+)?)\s*(Ki|Mi|Gi|Ti|k|M|G|T|m)?$/);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const unit = match[2] ?? '';
  switch (unit) {
    case 'Ki': return num * 1024;
    case 'Mi': return num * 1024 * 1024;
    case 'Gi': return num * 1024 * 1024 * 1024;
    case 'Ti': return num * 1024 * 1024 * 1024 * 1024;
    case 'k':  return num * 1000;
    case 'M':  return num * 1000 * 1000;
    case 'G':  return num * 1000 * 1000 * 1000;
    case 'T':  return num * 1000 * 1000 * 1000 * 1000;
    case 'm':  return num / 1000;
    default:   return num;
  }
}

function parseCpu(value: string): number {
  if (value.endsWith('m')) {
    return parseFloat(value.slice(0, -1));
  }
  return parseFloat(value) * 1000;
}
