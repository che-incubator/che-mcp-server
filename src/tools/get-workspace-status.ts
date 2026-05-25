import { getCustomObjectsApi, getNamespace } from '../kube/client.js';

interface GetWorkspaceStatusParams {
  workspace: string;
}

interface WorkspaceCondition {
  type: string;
  status: string;
  reason: string;
  message: string;
}

interface WorkspaceStatus {
  name: string;
  phase: string;
  devworkspaceId: string;
  mainUrl: string;
  started: boolean;
  createdAt: string;
  conditions: WorkspaceCondition[];
  annotations: Record<string, string>;
  labels: Record<string, string>;
}

export async function getWorkspaceStatus(
  params: GetWorkspaceStatusParams,
): Promise<WorkspaceStatus> {
  const api = getCustomObjectsApi();
  const namespace = getNamespace();

  const dw = (await api.getNamespacedCustomObject({
    group: 'workspace.devfile.io',
    version: 'v1alpha2',
    namespace,
    plural: 'devworkspaces',
    name: params.workspace,
  })) as any;

  return {
    name: dw.metadata?.name || '',
    phase: dw.status?.phase || 'Unknown',
    devworkspaceId: dw.status?.devworkspaceId || '',
    mainUrl: dw.status?.mainUrl || '',
    started: dw.spec?.started || false,
    createdAt: dw.metadata?.creationTimestamp || '',
    conditions: (dw.status?.conditions || []).map((c: any) => ({
      type: c.type || '',
      status: c.status || '',
      reason: c.reason || '',
      message: c.message || '',
    })),
    annotations: dw.metadata?.annotations || {},
    labels: dw.metadata?.labels || {},
  };
}
