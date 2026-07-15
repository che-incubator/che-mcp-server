import { getCustomObjectsApi, getNamespace } from '../kube/client.js';
import { AGENT_BASE_IMAGE } from '../types.js';
import { injectTool } from './inject-tool.js';

interface CreateWorkspaceParams {
  name?: string;
  tools?: string[];
  repo_url?: string;
  branch?: string;
  post_start_command?: string;
}

export function deriveProjectName(repoUrl: string): string {
  const stripped = repoUrl.replace(/\/+$/, '');
  const lastSegment = stripped.split('/').pop() ?? 'project';
  const name = lastSegment
    .replace(/\.git$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .replace(/-+$/, '');
  return name || 'project';
}

export async function createWorkspace(params: CreateWorkspaceParams): Promise<{
  name: string;
  started: boolean;
  tools_injected: string[];
}> {
  if (params.branch && !params.repo_url) {
    throw new Error('branch requires repo_url');
  }

  const api = getCustomObjectsApi();
  const namespace = getNamespace();

  const metadata: Record<string, string> = params.name
    ? { name: params.name }
    : { generateName: 'empty-' };

  const template: Record<string, unknown> = {
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
  };

  if (params.repo_url) {
    const projectName = deriveProjectName(params.repo_url);
    const gitSource: Record<string, unknown> = {
      remotes: { origin: params.repo_url },
    };
    if (params.branch) {
      gitSource.checkoutFrom = { revision: params.branch };
    }
    template.projects = [{ name: projectName, git: gitSource }];
  }

  if (params.post_start_command) {
    const existingCommands = Array.isArray(template.commands)
      ? template.commands
      : [];
    template.commands = [
      ...existingCommands,
      {
        id: 'post-start',
        exec: { component: 'dev', commandLine: params.post_start_command },
      },
    ];
    const existingEvents =
      template.events && typeof template.events === 'object'
        ? (template.events as Record<string, unknown>)
        : {};
    template.events = { ...existingEvents, postStart: ['post-start'] };
  }

  const body = {
    apiVersion: 'workspace.devfile.io/v1alpha2',
    kind: 'DevWorkspace',
    metadata,
    spec: {
      started: false,
      template,
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
