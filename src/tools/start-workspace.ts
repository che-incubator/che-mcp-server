import { getCustomObjectsApi, getNamespace } from '../kube/client.js';

interface StartWorkspaceParams {
  workspace: string;
}

export async function startWorkspace(
  params: StartWorkspaceParams,
): Promise<{ name: string; started: boolean }> {
  const api = getCustomObjectsApi();
  const namespace = getNamespace();

  await api.patchNamespacedCustomObject({
    group: 'workspace.devfile.io',
    version: 'v1alpha2',
    namespace,
    plural: 'devworkspaces',
    name: params.workspace,
    body: [{ op: 'replace', path: '/spec/started', value: true }],
  });

  return { name: params.workspace, started: true };
}
