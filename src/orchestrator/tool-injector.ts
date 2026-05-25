import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import { getCustomObjectsApi, getNamespace } from '../kube/client.js';

// ─── Registry types ───────────────────────────────────────────────────────────

interface JsonPatchOp {
  op: string;
  path: string;
  value?: unknown;
}

interface ToolEntry {
  description: string;
  pattern: string;
  binary: string;
  patch: JsonPatchOp[];
  editor: {
    volumeMounts: { name: string; path: string }[];
    env: { name: string; value: string }[];
    memoryLimit?: string;
    postStart?: string;
  };
}

interface RegistryData {
  registry: string;
  tag: string;
  infrastructure: { patch: JsonPatchOp[] };
  tools: Record<string, ToolEntry>;
}

// ─── Load registry ────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadRegistry(): RegistryData {
  const path =
    process.env.INJECT_TOOL_REGISTRY_FILE ??
    join(__dirname, '../tools/registry.json');
  return JSON.parse(readFileSync(path, 'utf-8')) as RegistryData;
}

const REGISTRY = loadRegistry();

function toolImage(tool: string): string {
  const registry = process.env.INJECT_TOOL_REGISTRY ?? REGISTRY.registry;
  const tag = process.env.INJECT_TOOL_TAG ?? REGISTRY.tag;
  return `${registry}/tools-injector/${tool}:${tag}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getAvailableTools(): string[] {
  return Object.keys(REGISTRY.tools);
}

export function validateTool(tool: string): void {
  if (!REGISTRY.tools[tool]) {
    const available = Object.keys(REGISTRY.tools).sort().join(', ');
    throw new Error(`Unknown tool "${tool}". Available: ${available}`);
  }
}

export async function injectToolIntoWorkspace(
  workspaceName: string,
  tool: string,
): Promise<void> {
  validateTool(tool);

  const api = getCustomObjectsApi();
  const namespace = getNamespace();

  const dw = (await api.getNamespacedCustomObject({
    group: 'workspace.devfile.io',
    version: 'v1alpha2',
    namespace,
    plural: 'devworkspaces',
    name: workspaceName,
  })) as any;

  // @kubernetes/client-node sends application/json-patch+json for PATCH requests.
  // The API server therefore expects a JSON patch array, not a merge patch object.
  const ops = buildJsonPatchOps(tool, dw);
  if (ops.length === 0) return;

  await api.patchNamespacedCustomObject({
    group: 'workspace.devfile.io',
    version: 'v1alpha2',
    namespace,
    plural: 'devworkspaces',
    name: workspaceName,
    body: ops,
  });

  // Write annotation so launch_coding_agent can detect that the tool is installed.
  // JSON Pointer requires '/' escaped as '~1'.
  // If metadata.annotations doesn't exist yet (e.g. workspace not yet started),
  // create the entire annotations object; otherwise add the specific key.
  // Annotation key format: "che.eclipse.org/tools-injector.<tool>"
  // Only one '/' is allowed in a Kubernetes annotation key (prefix/name).
  // The name part cannot contain '/', so we use '.' to separate injector from tool name.
  const annotationKey = `che.eclipse.org/tools-injector.${tool}`;
  const annotationOp: JsonPatchOp =
    (dw as any)?.metadata?.annotations != null
      ? {
          op: 'add',
          path: `/metadata/annotations/${annotationKey.replace(/\//g, '~1')}`,
          value: 'true',
        }
      : {
          op: 'add',
          path: '/metadata/annotations',
          value: { [annotationKey]: 'true' },
        };
  await api.patchNamespacedCustomObject({
    group: 'workspace.devfile.io',
    version: 'v1alpha2',
    namespace,
    plural: 'devworkspaces',
    name: workspaceName,
    body: [annotationOp],
  });
}

// ─── JSON patch builder ───────────────────────────────────────────────────────

export function buildJsonPatchOps(tool: string, dw: any): JsonPatchOp[] {
  const regTool = REGISTRY.tools[tool];
  const components: any[] = dw?.spec?.template?.components ?? [];
  const ops: JsonPatchOp[] = [];

  // Return empty if this tool's injector component is already present — idempotency guard.
  const hasInjector = components.some((c) => c.name === `${tool}-injector`);
  if (hasInjector) return [];

  // 1. Add shared injected-tools volume if not already present
  const hasVolume = components.some((c) => c.name === 'injected-tools');
  if (!hasVolume) {
    for (const op of REGISTRY.infrastructure.patch) {
      ops.push(JSON.parse(JSON.stringify(op)));
    }
  }

  // 2. Add injector init container (with correct image tag)
  for (const op of regTool.patch) {
    const cloned: any = JSON.parse(JSON.stringify(op));
    if (cloned.op === 'add' && cloned.value?.container?.image) {
      cloned.value.container.image = toolImage(tool);
    }
    ops.push(cloned);
  }

  // 3. Find editor — first container component that is not an injector or volume.
  // JSON patch ops are applied in order, so `/-` appends to the END of the array.
  // The editor (e.g. 'dev') stays at its original index throughout.
  const editorIdx = components.findIndex(
    (c) =>
      c.container &&
      !c.name.endsWith('-injector') &&
      c.name !== 'injected-tools',
  );

  if (editorIdx === -1) return ops;

  const editorContainer = components[editorIdx].container;

  // 3a. Volume mount on editor container
  const existingMounts: any[] = editorContainer.volumeMounts ?? [];
  const hasMount = existingMounts.some((m) => m.name === 'injected-tools');
  if (!hasMount) {
    const mountsPath = `/spec/template/components/${editorIdx}/container/volumeMounts`;
    const mountValue = { name: 'injected-tools', path: '/injected-tools' };
    if (existingMounts.length > 0) {
      ops.push({ op: 'add', path: `${mountsPath}/-`, value: mountValue });
    } else {
      ops.push({ op: 'add', path: mountsPath, value: [mountValue] });
    }
  }

  // 3b. PATH env var so /injected-tools/bin is discoverable
  const existingEnv: any[] = editorContainer.env ?? [];
  const hasPath = existingEnv.some(
    (e) =>
      e.name === 'PATH' && (e.value as string)?.includes('/injected-tools/bin'),
  );
  const pathVar = {
    name: 'PATH',
    value:
      '/injected-tools/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
  };
  if (!hasPath) {
    const envPath = `/spec/template/components/${editorIdx}/container/env`;
    if (existingEnv.length > 0) {
      ops.push({ op: 'add', path: `${envPath}/-`, value: pathVar });
    } else {
      ops.push({ op: 'add', path: envPath, value: [pathVar] });
    }
  }

  // 3c. Tool-specific env vars
  for (const envVar of regTool.editor.env) {
    const envPath = `/spec/template/components/${editorIdx}/container/env`;
    // At this point env array always exists (created in 3b if it was empty)
    ops.push({ op: 'add', path: `${envPath}/-`, value: envVar });
  }

  const editorName = components[editorIdx].name as string;

  // 4. Add apply command (install-{tool}) — makes the injector run as an init container.
  // If commands array doesn't exist in the workspace yet, create it; otherwise append.
  const existingCommands: any[] | null | undefined =
    dw?.spec?.template?.commands;
  const applyCommandValue = {
    id: `install-${tool}`,
    apply: { component: `${tool}-injector` },
  };
  if (existingCommands != null) {
    ops.push({
      op: 'add',
      path: '/spec/template/commands/-',
      value: applyCommandValue,
    });
  } else {
    ops.push({
      op: 'add',
      path: '/spec/template/commands',
      value: [applyCommandValue],
    });
  }

  // 5. Add preStart event referencing the apply command.
  // If the events object doesn't exist yet, create it with preStart; otherwise append to preStart.
  const existingEvents: any | null | undefined = dw?.spec?.template?.events;
  const existingPreStart: string[] | null | undefined =
    existingEvents?.preStart;
  if (existingEvents != null && existingPreStart != null) {
    ops.push({
      op: 'add',
      path: '/spec/template/events/preStart/-',
      value: `install-${tool}`,
    });
  } else if (existingEvents != null) {
    // events object exists but preStart key is absent
    ops.push({
      op: 'add',
      path: '/spec/template/events/preStart',
      value: [`install-${tool}`],
    });
  } else {
    // no events object at all — create it with preStart
    ops.push({
      op: 'add',
      path: '/spec/template/events',
      value: { preStart: [`install-${tool}`] },
    });
  }

  // 6. Add symlink exec command (symlink-{tool}) + postStart event.
  // The symlink command runs in the editor container and puts the binary on PATH.
  const binary = regTool.binary;
  const pattern = regTool.pattern;
  const symlinkTarget =
    pattern === 'init'
      ? `/injected-tools/${binary}`
      : `/injected-tools/${tool}/bin/${binary}`;

  const pathCmd =
    'grep -q injected-tools /etc/profile.d/injected-tools.sh 2>/dev/null' +
    ' || echo \'export PATH="/injected-tools/bin:$PATH"\' > /etc/profile.d/injected-tools.sh 2>/dev/null;' +
    ' grep -q injected-tools "$HOME/.bashrc" 2>/dev/null' +
    ' || echo \'export PATH="/injected-tools/bin:$PATH"\' >> "$HOME/.bashrc" 2>/dev/null; true';
  let cmdline = `mkdir -p /injected-tools/bin && ln -sf ${symlinkTarget} /injected-tools/bin/${binary} && ${pathCmd}`;
  const setupCmd = regTool.editor.postStart ?? '';
  if (setupCmd) {
    cmdline = `${setupCmd} && ${cmdline}`;
  }

  const symlinkCmdId = `symlink-${tool}`;
  ops.push({
    op: 'add',
    path: '/spec/template/commands/-',
    value: {
      id: symlinkCmdId,
      exec: { component: editorName, commandLine: cmdline },
    },
  });

  // Add postStart event. By the time we reach here the events object always exists
  // (created in step 5 if it was absent), so we only need to check whether postStart
  // key was already present in the *original* workspace spec.
  const existingPostStart: string[] | null | undefined =
    existingEvents?.postStart;
  if (existingPostStart != null) {
    ops.push({
      op: 'add',
      path: '/spec/template/events/postStart/-',
      value: symlinkCmdId,
    });
  } else {
    ops.push({
      op: 'add',
      path: '/spec/template/events/postStart',
      value: [symlinkCmdId],
    });
  }

  return ops;
}
