import { getCoreV1Api, getNamespace } from '../kube/client.js';
import { findPodForWorkspace } from '../kube/exec.js';

interface GetWorkspacePodParams {
  workspace: string;
}

interface ContainerInfo {
  name: string;
  ready: boolean;
  restartCount: number;
}

interface WorkspacePodInfo {
  workspace: string;
  podName: string;
  phase: string;
  containers: ContainerInfo[];
}

export async function getWorkspacePod(
  params: GetWorkspacePodParams,
): Promise<WorkspacePodInfo> {
  const { podName } = await findPodForWorkspace(params.workspace);
  const coreApi = getCoreV1Api();
  const namespace = getNamespace();

  const pod = await coreApi.readNamespacedPod({
    name: podName,
    namespace,
  });

  const containers = (pod.status?.containerStatuses || []).map((cs: any) => ({
    name: cs.name,
    ready: cs.ready,
    restartCount: cs.restartCount,
  }));

  return {
    workspace: params.workspace,
    podName,
    phase: pod.status?.phase || 'Unknown',
    containers,
  };
}
