import { getCustomObjectsApi, getNamespace } from './client.js';
import { ANN_SESSION, ANN_TYPE, ANN_TASK, ANN_LAUNCHED, ANN_SESSIONS } from '../types.js';
import type { AgentSessionEntry } from '../types.js';

const MAX_CONFLICT_RETRIES = 3;

export interface AgentAnnotationValues {
  session: string | null;
  agent_type: string | null;
  task: string | null;
  launched_at: string | null;
}

const DW_GROUP = 'workspace.devfile.io';
const DW_VERSION = 'v1alpha2';
const DW_PLURAL = 'devworkspaces';

export async function readAgentAnnotations(
  workspace: string,
): Promise<AgentAnnotationValues> {
  const api = getCustomObjectsApi();
  const ns = getNamespace();

  const dw = (await api.getNamespacedCustomObject({
    group: DW_GROUP,
    version: DW_VERSION,
    namespace: ns,
    plural: DW_PLURAL,
    name: workspace,
  })) as any;

  if (!dw || typeof dw !== 'object') {
    throw new Error(
      `Unexpected response for workspace "${workspace}": ${JSON.stringify(dw)}`,
    );
  }

  const ann: Record<string, string> = dw.metadata?.annotations ?? {};

  return {
    session: ann[ANN_SESSION] ?? null,
    agent_type: ann[ANN_TYPE] ?? null,
    task: ann[ANN_TASK] ?? null,
    launched_at: ann[ANN_LAUNCHED] ?? null,
  };
}

export async function writeAgentAnnotations(
  workspace: string,
  values: AgentAnnotationValues,
): Promise<void> {
  const api = getCustomObjectsApi();
  const ns = getNamespace();

  // @kubernetes/client-node sends application/json-patch+json for PATCH requests.
  // Build a JSON patch array — never a merge-patch object.
  // launchCodingAgent calls ensureWorkspaceRunning first, so metadata.annotations exists.
  const entries: [string, string | null][] = [
    [ANN_SESSION, values.session],
    [ANN_TYPE, values.agent_type],
    [ANN_TASK, values.task],
    [ANN_LAUNCHED, values.launched_at],
  ];

  const ops = entries
    .filter(([, val]) => val !== null)
    .map(([key, val]) => ({
      op: 'add',
      path: `/metadata/annotations/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`,
      value: val as string,
    }));

  if (ops.length === 0) return;

  await api.patchNamespacedCustomObject({
    group: DW_GROUP,
    version: DW_VERSION,
    namespace: ns,
    plural: DW_PLURAL,
    name: workspace,
    body: ops,
  });
}

export async function clearAgentAnnotations(workspace: string): Promise<void> {
  const api = getCustomObjectsApi();
  const ns = getNamespace();

  // Read current annotations to only remove keys that actually exist.
  const dw = (await api.getNamespacedCustomObject({
    group: DW_GROUP,
    version: DW_VERSION,
    namespace: ns,
    plural: DW_PLURAL,
    name: workspace,
  })) as any;
  const current: Record<string, string> = dw?.metadata?.annotations ?? {};

  const keysToRemove = [ANN_SESSION, ANN_TYPE, ANN_TASK, ANN_LAUNCHED].filter(
    (k) => k in current,
  );

  if (keysToRemove.length === 0) return;

  const ops = keysToRemove.map((key) => ({
    op: 'remove',
    path: `/metadata/annotations/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`,
  }));

  await api.patchNamespacedCustomObject({
    group: DW_GROUP,
    version: DW_VERSION,
    namespace: ns,
    plural: DW_PLURAL,
    name: workspace,
    body: ops,
  });
}

async function readAgentSessionsWithVersion(
  workspace: string,
): Promise<{ sessions: AgentSessionEntry[]; resourceVersion: string }> {
  const api = getCustomObjectsApi();
  const ns  = getNamespace();

  const dw = await api.getNamespacedCustomObject({
    group: DW_GROUP, version: DW_VERSION, namespace: ns, plural: DW_PLURAL, name: workspace,
  }) as any;

  if (!dw || typeof dw !== 'object') {
    throw new Error(`Unexpected response for workspace "${workspace}": ${JSON.stringify(dw)}`);
  }

  const resourceVersion: string = dw.metadata?.resourceVersion ?? '';
  const ann: Record<string, string> = dw.metadata?.annotations ?? {};

  const sessionsJson = ann[ANN_SESSIONS];
  if (sessionsJson) {
    try {
      const parsed = JSON.parse(sessionsJson);
      if (Array.isArray(parsed)) {
        return { sessions: parsed as AgentSessionEntry[], resourceVersion };
      }
    } catch {
      // Malformed JSON — fall through to legacy check
    }
  }

  const legacySession = ann[ANN_SESSION];
  if (legacySession) {
    return {
      sessions: [{
        session_id: legacySession,
        backend: ann[ANN_TYPE] ?? 'unknown',
        status: 'running',
        working_dir: '/projects',
        task: ann[ANN_TASK] ?? '',
        launched_at: ann[ANN_LAUNCHED] ?? '',
      }],
      resourceVersion,
    };
  }

  return { sessions: [], resourceVersion };
}

export async function readAgentSessions(workspace: string): Promise<AgentSessionEntry[]> {
  const { sessions } = await readAgentSessionsWithVersion(workspace);
  return sessions;
}

export async function writeAgentSessions(
  workspace: string,
  sessions: AgentSessionEntry[],
  resourceVersion?: string,
): Promise<void> {
  const api = getCustomObjectsApi();
  const ns  = getNamespace();

  const ops: Array<{ op: string; path: string; value: string }> = [];

  if (resourceVersion) {
    ops.push({
      op: 'test',
      path: '/metadata/resourceVersion',
      value: resourceVersion,
    });
  }

  ops.push({
    op: 'add',
    path: `/metadata/annotations/${ANN_SESSIONS.replace(/~/g, '~0').replace(/\//g, '~1')}`,
    value: JSON.stringify(sessions),
  });

  await api.patchNamespacedCustomObject({
    group: DW_GROUP, version: DW_VERSION, namespace: ns, plural: DW_PLURAL, name: workspace,
    body: ops,
  });
}

export async function addAgentSession(
  workspace: string,
  entry: AgentSessionEntry,
): Promise<void> {
  for (let attempt = 1; attempt <= MAX_CONFLICT_RETRIES; attempt++) {
    const { sessions, resourceVersion } = await readAgentSessionsWithVersion(workspace);
    sessions.push(entry);
    try {
      await writeAgentSessions(workspace, sessions, resourceVersion);
      return;
    } catch (error) {
      if (isConflictError(error) && attempt < MAX_CONFLICT_RETRIES) {
        continue;
      }
      throw error;
    }
  }
}

export async function removeAgentSession(
  workspace: string,
  session_id: string,
): Promise<void> {
  for (let attempt = 1; attempt <= MAX_CONFLICT_RETRIES; attempt++) {
    const { sessions, resourceVersion } = await readAgentSessionsWithVersion(workspace);
    const filtered = sessions.filter(s => s.session_id !== session_id);
    try {
      await writeAgentSessions(workspace, filtered, resourceVersion);
      return;
    } catch (error) {
      if (isConflictError(error) && attempt < MAX_CONFLICT_RETRIES) {
        continue;
      }
      throw error;
    }
  }
}

function isConflictError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const e = error as any;
    const code = e.statusCode ?? e.response?.statusCode ?? e.body?.code;
    return code === 409 || code === 422;
  }
  return false;
}
