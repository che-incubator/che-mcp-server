# Create Workspace with Repository Clone — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional `repo_url` and `branch` parameters to `create_workspace` so that a DevWorkspace can start with a git repository pre-cloned.

**Architecture:** When `repo_url` is provided, inject a `projects` entry into the DevWorkspace `spec.template`. The DevWorkspace operator handles the actual clone to `/projects/<name>`. Project name is derived from the URL's last path segment, stripping `.git` and trailing slashes.

**Tech Stack:** TypeScript, Zod (parameter validation), Vitest (testing), `@kubernetes/client-node`

## Global Constraints

- ESM modules — all imports use `.js` extensions
- Kebab-case filenames, snake_case for MCP tool names
- Strict TypeScript (ES2022, Node16 modules)
- Tests mirror source structure under `tests/`
- Build: `npm run build` — Lint: via Biome — Test: `npm test`

---

### Task 1: Add repo_url and branch support to create-workspace

**Files:**
- Modify: `src/tools/create-workspace.ts` (entire file — add params, validation, projects array building)
- Modify: `src/tools.ts:298-319` (add zod params to tool registration, pass through)
- Modify: `tests/tools/create-workspace.test.ts` (add 4 new test cases)

**Interfaces:**
- Consumes: existing `createWorkspace` function, Kubernetes `createNamespacedCustomObject` API
- Produces: updated `createWorkspace({ name?, tools?, repo_url?, branch? })` — same return type `{ name, started, tools_injected }`

#### Step 1: Write the failing tests

- [ ] **Step 1a: Add test for `repo_url` only**

Add this test to `tests/tools/create-workspace.test.ts` inside the existing `describe('createWorkspace')` block, after the last `it()`:

```ts
it('creates a workspace with repo_url and projects entry', async () => {
  const { getCustomObjectsApi, getNamespace } = await import(
    '../../src/kube/client.js'
  );
  const mockApi = {
    createNamespacedCustomObject: vi.fn().mockResolvedValue({
      metadata: { name: 'my-workspace' },
    }),
    patchNamespacedCustomObject: vi.fn().mockResolvedValue({}),
  };
  vi.mocked(getCustomObjectsApi).mockReturnValue(mockApi as any);
  vi.mocked(getNamespace).mockReturnValue('test-namespace');

  const { createWorkspace } = await import(
    '../../src/tools/create-workspace.js'
  );
  const result = await createWorkspace({
    name: 'my-workspace',
    repo_url: 'https://github.com/org/my-app.git',
  });

  expect(result).toEqual({
    name: 'my-workspace',
    started: true,
    tools_injected: [],
  });

  const body = mockApi.createNamespacedCustomObject.mock.calls[0][0].body;
  expect(body.spec.template.projects).toEqual([
    {
      name: 'my-app',
      git: {
        remotes: { origin: 'https://github.com/org/my-app.git' },
      },
    },
  ]);
});
```

- [ ] **Step 1b: Add test for `repo_url` + `branch`**

```ts
it('creates a workspace with repo_url and branch', async () => {
  const { getCustomObjectsApi, getNamespace } = await import(
    '../../src/kube/client.js'
  );
  const mockApi = {
    createNamespacedCustomObject: vi.fn().mockResolvedValue({
      metadata: { name: 'my-workspace' },
    }),
    patchNamespacedCustomObject: vi.fn().mockResolvedValue({}),
  };
  vi.mocked(getCustomObjectsApi).mockReturnValue(mockApi as any);
  vi.mocked(getNamespace).mockReturnValue('test-namespace');

  const { createWorkspace } = await import(
    '../../src/tools/create-workspace.js'
  );
  await createWorkspace({
    name: 'my-workspace',
    repo_url: 'https://github.com/org/my-app',
    branch: 'feature-branch',
  });

  const body = mockApi.createNamespacedCustomObject.mock.calls[0][0].body;
  expect(body.spec.template.projects).toEqual([
    {
      name: 'my-app',
      git: {
        remotes: { origin: 'https://github.com/org/my-app' },
        checkoutFrom: { revision: 'feature-branch' },
      },
    },
  ]);
});
```

- [ ] **Step 1c: Add test for `branch` without `repo_url` (validation error)**

```ts
it('throws when branch is provided without repo_url', async () => {
  const { createWorkspace } = await import(
    '../../src/tools/create-workspace.js'
  );

  await expect(
    createWorkspace({ branch: 'main' }),
  ).rejects.toThrow('branch requires repo_url');
});
```

- [ ] **Step 1d: Add test for project name derivation edge cases**

```ts
it('derives project name from repo_url correctly', async () => {
  const { getCustomObjectsApi, getNamespace } = await import(
    '../../src/kube/client.js'
  );
  const mockApi = {
    createNamespacedCustomObject: vi.fn().mockResolvedValue({
      metadata: { name: 'ws' },
    }),
    patchNamespacedCustomObject: vi.fn().mockResolvedValue({}),
  };
  vi.mocked(getCustomObjectsApi).mockReturnValue(mockApi as any);
  vi.mocked(getNamespace).mockReturnValue('test-namespace');

  const { createWorkspace } = await import(
    '../../src/tools/create-workspace.js'
  );

  // Trailing slash
  await createWorkspace({ name: 'ws', repo_url: 'https://github.com/org/trailing/' });
  let body = mockApi.createNamespacedCustomObject.mock.calls[0][0].body;
  expect(body.spec.template.projects[0].name).toBe('trailing');

  // Nested path with .git
  mockApi.createNamespacedCustomObject.mockResolvedValue({ metadata: { name: 'ws' } });
  await createWorkspace({ name: 'ws', repo_url: 'https://gitlab.com/group/sub/repo.git' });
  body = mockApi.createNamespacedCustomObject.mock.calls[1][0].body;
  expect(body.spec.template.projects[0].name).toBe('repo');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/tools/create-workspace.test.ts`
Expected: 4 new tests FAIL (unknown parameters / missing implementation)

#### Step 3: Implement the changes

- [ ] **Step 3a: Update `src/tools/create-workspace.ts`**

Replace the full file content with:

```ts
import { getCustomObjectsApi, getNamespace } from '../kube/client.js';
import { AGENT_BASE_IMAGE } from '../types.js';
import { injectTool } from './inject-tool.js';

interface CreateWorkspaceParams {
  name?: string;
  tools?: string[];
  repo_url?: string;
  branch?: string;
}

export function deriveProjectName(repoUrl: string): string {
  const stripped = repoUrl.replace(/\/+$/, '');
  const lastSegment = stripped.split('/').pop() ?? 'project';
  return lastSegment.replace(/\.git$/, '');
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
```

- [ ] **Step 3b: Update tool registration in `src/tools.ts`**

In `src/tools.ts`, find the `create_workspace` tool registration (around line 298-319). Replace the parameter object and handler to pass the new params:

Replace:
```ts
    {
      name: z
        .string()
        .optional()
        .describe('Workspace name (auto-generated if omitted)'),
      tools: z
        .array(TOOL_ENUM)
        .optional()
        .describe('Tools to pre-install on workspace creation'),
    },
    async ({ name, tools }) => {
      try {
        const result = await createWorkspace({ name, tools });
```

With:
```ts
    {
      name: z
        .string()
        .optional()
        .describe('Workspace name (auto-generated if omitted)'),
      tools: z
        .array(TOOL_ENUM)
        .optional()
        .describe('Tools to pre-install on workspace creation'),
      repo_url: z
        .string()
        .url()
        .optional()
        .describe('Git repository URL to clone into the workspace'),
      branch: z
        .string()
        .optional()
        .describe('Branch or revision to check out (requires repo_url)'),
    },
    async ({ name, tools, repo_url, branch }) => {
      try {
        const result = await createWorkspace({ name, tools, repo_url, branch });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/tools/create-workspace.test.ts`
Expected: all 6 tests PASS (2 existing + 4 new)

- [ ] **Step 5: Run full test suite and build**

Run: `npm test && npm run build`
Expected: all tests pass, build succeeds with no errors
