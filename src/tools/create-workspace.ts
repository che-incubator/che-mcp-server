import { getCustomObjectsApi, getNamespace } from '../kube/client.js';
import { AGENT_BASE_IMAGE } from '../types.js';
import { injectTool } from './inject-tool.js';

interface CreateWorkspaceParams {
  name?: string;
  tools?: string[];
}

export async function createWorkspace(params: CreateWorkspaceParams): Promise<{
  name: string;
  started: boolean;
  tools_injected: string[];
}> {
  const api = getCustomObjectsApi();
  const namespace = getNamespace();

  const metadata: Record<string, string> = params.name
    ? { name: params.name }
    : { generateName: 'empty-' };

  const body = {
    apiVersion: 'workspace.devfile.io/v1alpha2',
    kind: 'DevWorkspace',
    metadata,
    spec: {
      started: false,
      template: {
        components: [
          {
            name: 'dev',
            container: {
              image: AGENT_BASE_IMAGE,
              memoryLimit: '8Gi',
              memoryRequest: '1Gi',
              cpuRequest: '500m',
              cpuLimit: '2000m',
              endpoints: [
                {
                  name: 'ttyd-terminal',
                  targetPort: 7681,
                  exposure: 'public',
                  protocol: 'https',
                  attributes: {
                    type: 'main',
                    cookiesAuthEnabled: true,
                    discoverable: false,
                    urlRewriteSupported: true,
                  },
                },
              ],
            },
          },
        ],
      },
    },
  };

  const result = await api.createNamespacedCustomObject({
    group: 'workspace.devfile.io',
    version: 'v1alpha2',
    namespace,
    plural: 'devworkspaces',
    body,
  });

  const workspaceName: string = (result as any).metadata.name;
  const toolsToInject = params.tools ?? [];
  const injected: string[] = [];

  for (const tool of toolsToInject) {
    await injectTool({ workspace: workspaceName, tool });
    injected.push(tool);
  }

  // Start workspace after all patches applied.
  // Must use JSON patch array — @kubernetes/client-node sends application/json-patch+json,
  // which requires an array body (not a merge-patch object).
  await api.patchNamespacedCustomObject({
    group: 'workspace.devfile.io',
    version: 'v1alpha2',
    namespace,
    plural: 'devworkspaces',
    name: workspaceName,
    body: [{ op: 'replace', path: '/spec/started', value: true }],
  });

  return { name: workspaceName, started: true, tools_injected: injected };
}
