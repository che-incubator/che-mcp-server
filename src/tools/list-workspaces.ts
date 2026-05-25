import { getCustomObjectsApi, getNamespace } from '../kube/client.js';
import { AGENT_ANNOTATION_PREFIX } from '../types.js';
import type { WorkspaceInfo } from '../types.js';

interface ListWorkspacesParams {
  limit?: number;
  offset?: number;
}

interface ListWorkspacesResult {
  items: WorkspaceInfo[];
  total: number;
  count: number;
  offset: number;
  has_more: boolean;
}

export async function listWorkspaces(
  params: ListWorkspacesParams = {},
): Promise<ListWorkspacesResult> {
  const api = getCustomObjectsApi();
  const namespace = getNamespace();

  const response = await api.listNamespacedCustomObject({
    group: 'workspace.devfile.io',
    version: 'v1alpha2',
    namespace,
    plural: 'devworkspaces',
  });

  const allItems = (response as any).items || [];
  const total = allItems.length;
  const offset = params.offset ?? 0;
  const limit = params.limit ?? 50;
  const page = allItems.slice(offset, offset + limit);

  const items = page.map((dw: any) => {
    const allAnnotations: Record<string, string> =
      dw.metadata?.annotations || {};
    const agentAnnotations: Record<string, string> = {};
    for (const [key, value] of Object.entries(allAnnotations)) {
      if (key.startsWith(AGENT_ANNOTATION_PREFIX)) {
        agentAnnotations[key] = value as string;
      }
    }
    return {
      name: dw.metadata?.name || '',
      phase: dw.status?.phase || 'Unknown',
      url: dw.status?.mainUrl || '',
      annotations: agentAnnotations,
    };
  });

  return {
    items,
    total,
    count: items.length,
    offset,
    has_more: offset + limit < total,
  };
}
