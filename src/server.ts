import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createMcpServer } from './tools.js';
import type { ServerMode } from './types.js';

const transports = new Map<string, StreamableHTTPServerTransport>();

export async function startHttpServer(port: number): Promise<http.Server> {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

    if (url.pathname === '/healthz' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
      return;
    }

    if (url.pathname === '/mcp') {
      if (
        req.method === 'POST' ||
        req.method === 'GET' ||
        req.method === 'DELETE'
      ) {
        await handleMcpRequest(req, res);
      } else {
        res.writeHead(405).end('Method Not Allowed');
      }
      return;
    }

    res.writeHead(404).end('Not Found');
  });

  return new Promise((resolve, reject) => {
    server.listen(port, () => resolve(server));
    server.on('error', reject);
  });
}

async function handleMcpRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  console.log(
    `[mcp] ${req.method} sessionId=${sessionId ?? '(none)'} activeSessions=${transports.size}`,
  );

  // Parse body for POST requests (needed for both existing and new sessions)
  let parsedBody: unknown;
  if (req.method === 'POST') {
    const body = await readBody(req);
    try {
      parsedBody = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32700, message: 'Parse error' },
          id: null,
        }),
      );
      return;
    }
    normalizeToolCallArguments(parsedBody);
  }

  // Existing session — delegate
  if (sessionId && transports.has(sessionId)) {
    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res, parsedBody);
    return;
  }

  // New session — only via POST with initialize request
  if (req.method === 'POST') {
    if (!sessionId && isInitializeRequest(parsedBody)) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          transports.set(sid, transport);
        },
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) transports.delete(sid);
      };

      const mode = (process.env.CHE_MCP_MODE ?? 'orchestration') as ServerMode;
      const mcpServer = createMcpServer(mode);
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, parsedBody);
      return;
    }
  }

  // Unknown session ID — tell client to re-initialize (404 per MCP spec)
  if (sessionId) {
    console.log(`[mcp] 404: unknown sessionId=${sessionId}`);
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Session not found. Please re-initialize.',
        },
        id: null,
      }),
    );
    return;
  }

  console.log(
    `[mcp] 400: method=${req.method} no session, not an initialize request`,
  );
  res.writeHead(400, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Bad Request: No valid session ID provided',
      },
      id: null,
    }),
  );
}

// Some MCP clients send arguments: null for tools with no parameters.
// The MCP SDK expects an empty object, so normalize here.
function normalizeToolCallArguments(body: unknown): void {
  const messages = Array.isArray(body) ? body : [body];
  for (const msg of messages) {
    if (
      msg &&
      typeof msg === 'object' &&
      'method' in msg &&
      (msg as any).method === 'tools/call' &&
      'params' in msg &&
      (msg as any).params &&
      (msg as any).params.arguments === null
    ) {
      (msg as any).params.arguments = {};
    }
  }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

export async function shutdownHttpServer(server: http.Server): Promise<void> {
  for (const [sid, transport] of transports) {
    await transport.close();
    transports.delete(sid);
  }
  return new Promise((resolve) => server.close(() => resolve()));
}
