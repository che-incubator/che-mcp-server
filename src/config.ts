export interface ServerConfig {
  transport: 'stdio' | 'http';
  port: number;
}

const DEFAULT_PORT = 8080;

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

  return { transport, port };
}

function getArgValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1 || index + 1 >= argv.length) return undefined;
  return argv[index + 1];
}
