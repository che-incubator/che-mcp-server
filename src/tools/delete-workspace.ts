import { getCustomObjectsApi, getNamespace } from '../kube/client.js';

interface DeleteWorkspaceParams {
  workspace: string;
}

export async function deleteWorkspace(
  params: DeleteWorkspaceParams,
): Promise<{ name: string; deleted: boolean }> {
  const api = getCustomObjectsApi();
  const namespace = getNamespace();

  await api.deleteNamespacedCustomObject({
    group: 'workspace.devfile.io',
    version: 'v1alpha2',
    namespace,
    plural: 'devworkspaces',
    name: params.workspace,
  });

  return { name: params.workspace, deleted: true };
}
