#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { initKubeClient } from './kube/client.js';
import { parseConfig } from './config.js';
import { createMcpServer } from './tools.js';
import { startHttpServer, shutdownHttpServer } from './server.js';
import type { ServerMode } from './types.js';

async function main(): Promise<void> {
  const config = parseConfig(process.argv.slice(2));
  await initKubeClient();

  if (config.transport === 'http') {
    const server = await startHttpServer(config.port);
    const address = server.address();
    const port =
      typeof address === 'object' && address ? address.port : config.port;
    console.log(`che-mcp-server listening on port ${port}`);

    const shutdown = async () => {
      console.log('Shutting down...');
      await shutdownHttpServer(server);
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } else {
    const mode = (process.env.CHE_MCP_MODE ?? 'orchestration') as ServerMode;
    const server = createMcpServer(mode);
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch((error) => {
  console.error('Failed to start che-mcp-server:', error);
  process.exit(1);
});
