import { readFileSync } from 'node:fs';

export interface ServerConfig {
  transport: 'stdio' | 'http';
  port: number;
  authEnabled: boolean;
  namespace: string;
}

const DEFAULT_PORT = 8080;
const SA_NAMESPACE_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/namespace';

export function parseConfig(argv: string[]): ServerConfig {
  const transportArg = getArgValue(argv, '--transport');
  const portArg = getArgValue(argv, '--port');

  const transport = transportArg ?? process.env.CHE_MCP_TRANSPORT ?? 'stdio';

  if (transport !== 'stdio' && transport !== 'http') {
    throw new Error(
      `Invalid transport "${transport}". Must be "stdio" or "http".`,
    );
  }

  const portStr = portArg ?? process.env.CHE_MCP_PORT;
  const port = portStr ? parseInt(portStr, 10) : DEFAULT_PORT;

  let authEnabled: boolean;
  if (transport === 'stdio') {
    authEnabled = false;
  } else {
    const authEnv = process.env.CHE_MCP_AUTH_ENABLED;
    authEnabled = authEnv !== undefined ? authEnv === 'true' : true;
  }

  let namespace = process.env.NAMESPACE ?? '';
  if (!namespace) {
    try {
      namespace = readFileSync(SA_NAMESPACE_PATH, 'utf-8').trim();
    } catch {
      // not in-cluster, leave empty
    }
  }

  return { transport, port, authEnabled, namespace };
}

function getArgValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1 || index + 1 >= argv.length) return undefined;
  return argv[index + 1];
}
