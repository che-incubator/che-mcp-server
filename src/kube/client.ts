import * as k8s from '@kubernetes/client-node';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

let kubeConfig: k8s.KubeConfig;
let namespace: string;
let customObjectsApi: k8s.CustomObjectsApi;
let coreV1Api: k8s.CoreV1Api;

const NAMESPACE_SUFFIXES = ['-che', '-devspaces'];
const SA_NAMESPACE_PATH =
  '/var/run/secrets/kubernetes.io/serviceaccount/namespace';

export async function initKubeClient(): Promise<void> {
  kubeConfig = new k8s.KubeConfig();
  kubeConfig.loadFromDefault();

  customObjectsApi = kubeConfig.makeApiClient(k8s.CustomObjectsApi);
  coreV1Api = kubeConfig.makeApiClient(k8s.CoreV1Api);

  const context = kubeConfig.getContextObject(kubeConfig.getCurrentContext());
  namespace = context?.namespace || process.env.CHE_MCP_NAMESPACE || '';

  if (!namespace) {
    try {
      namespace = readFileSync(SA_NAMESPACE_PATH, 'utf-8').trim();
    } catch {
      // not running in-cluster, skip
    }
  }

  if (!namespace) {
    namespace = await detectNamespace();
  }

  if (!namespace) {
    throw new Error(
      'Cannot determine namespace. Set namespace in kubeconfig context or CHE_MCP_NAMESPACE env var.',
    );
  }
}

async function detectNamespace(): Promise<string> {
  let username: string;
  try {
    username = execFileSync('oc', ['whoami'], {
      timeout: 5000,
      encoding: 'utf-8',
    }).trim();
  } catch {
    return '';
  }

  if (!username) {
    return '';
  }

  for (const suffix of NAMESPACE_SUFFIXES) {
    const candidate = username + suffix;
    try {
      await coreV1Api.readNamespace({ name: candidate });
      return candidate;
    } catch {
      // namespace doesn't exist, try next
    }
  }

  return '';
}

export function getNamespace(): string {
  return namespace;
}

export function getCustomObjectsApi(): k8s.CustomObjectsApi {
  return customObjectsApi;
}

export function getCoreV1Api(): k8s.CoreV1Api {
  return coreV1Api;
}

export function getKubeConfig(): k8s.KubeConfig {
  return kubeConfig;
}
