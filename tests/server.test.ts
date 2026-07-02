import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ServerConfig } from '../src/config.js';

const noAuthConfig: ServerConfig = {
  transport: 'http',
  port: 0,
  authEnabled: false,
  namespace: '',
};

describe('startHttpServer (auth disabled)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('responds 200 on GET /healthz', async () => {
    vi.doMock('../src/tools.js', () => ({
      createMcpServer: () => ({ connect: vi.fn() }),
    }));

    const { startHttpServer } = await import('../src/server.js');
    const httpServer = await startHttpServer(0, noAuthConfig);
    const port = (httpServer.address() as any).port;

    try {
      const res = await fetch(`http://localhost:${port}/healthz`);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toBe('OK');
    } finally {
      httpServer.close();
    }
  });

  it('returns 404 for unknown paths', async () => {
    vi.doMock('../src/tools.js', () => ({
      createMcpServer: () => ({ connect: vi.fn() }),
    }));

    const { startHttpServer } = await import('../src/server.js');
    const httpServer = await startHttpServer(0, noAuthConfig);
    const port = (httpServer.address() as any).port;

    try {
      const res = await fetch(`http://localhost:${port}/unknown`);
      expect(res.status).toBe(404);
    } finally {
      httpServer.close();
    }
  });

  it('returns 405 for unsupported methods on /mcp', async () => {
    vi.doMock('../src/tools.js', () => ({
      createMcpServer: () => ({ connect: vi.fn() }),
    }));

    const { startHttpServer } = await import('../src/server.js');
    const httpServer = await startHttpServer(0, noAuthConfig);
    const port = (httpServer.address() as any).port;

    try {
      const res = await fetch(`http://localhost:${port}/mcp`, {
        method: 'PUT',
      });
      expect(res.status).toBe(405);
    } finally {
      httpServer.close();
    }
  });
});

describe('startHttpServer (auth enabled)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  const authConfig: ServerConfig = {
    transport: 'http',
    port: 0,
    authEnabled: true,
    namespace: 'test-ns',
  };

  it('returns 401 for unauthenticated POST /mcp', async () => {
    vi.doMock('../src/tools.js', () => ({
      createMcpServer: () => ({ connect: vi.fn() }),
    }));
    vi.doMock('@che-incubator/k8s-mcp-auth', () => ({
      rawHttpK8sAuth: (config: any) => {
        return async (req: any, res: any, next: any) => {
          const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
          for (const p of config.publicPaths) {
            if (p.method.toUpperCase() === req.method && p.path === url.pathname) {
              await next();
              return;
            }
          }
          const auth = req.headers.authorization;
          if (!auth || !auth.startsWith('Bearer ')) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'Missing bearer token' } }));
            return;
          }
          const token = auth.split(' ')[1];
          if (token === 'valid-token') {
            (req as any).authContext = { user: 'test-user', groups: [] };
            await next();
          } else {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'Invalid token' } }));
          }
        };
      },
      createDefaultK8sClient: () => ({}),
    }));

    const { startHttpServer } = await import('../src/server.js');
    const httpServer = await startHttpServer(0, authConfig);
    const port = (httpServer.address() as any).port;

    try {
      const res = await fetch(`http://localhost:${port}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe('UNAUTHENTICATED');
    } finally {
      httpServer.close();
    }
  });

  it('allows GET /healthz without auth when auth is enabled', async () => {
    vi.doMock('../src/tools.js', () => ({
      createMcpServer: () => ({ connect: vi.fn() }),
    }));
    vi.doMock('@che-incubator/k8s-mcp-auth', () => ({
      rawHttpK8sAuth: (config: any) => {
        return async (req: any, res: any, next: any) => {
          const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
          for (const p of config.publicPaths) {
            if (p.method.toUpperCase() === req.method && p.path === url.pathname) {
              await next();
              return;
            }
          }
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { code: 'UNAUTHENTICATED' } }));
        };
      },
      createDefaultK8sClient: () => ({}),
    }));

    const { startHttpServer } = await import('../src/server.js');
    const httpServer = await startHttpServer(0, authConfig);
    const port = (httpServer.address() as any).port;

    try {
      const res = await fetch(`http://localhost:${port}/healthz`);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('OK');
    } finally {
      httpServer.close();
    }
  });

  it('passes through with valid bearer token', async () => {
    const mockConnect = vi.fn();
    const mockHandleRequest = vi.fn(async (req: any, res: any) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', result: { ok: true }, id: 1 }));
    });

    vi.doMock('../src/tools.js', () => ({
      createMcpServer: () => ({ connect: mockConnect }),
    }));
    vi.doMock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
      StreamableHTTPServerTransport: class {
        sessionId = null;
        onclose = null;
        constructor(config: any) {
          // Call onsessioninitialized after the constructor returns
          // to avoid the ReferenceError
          setTimeout(() => {
            if (config.onsessioninitialized) {
              config.onsessioninitialized('test-session-id');
            }
          }, 0);
        }
        async handleRequest(req: any, res: any, body: any) {
          return mockHandleRequest(req, res, body);
        }
        async close() {}
      },
    }));
    vi.doMock('@che-incubator/k8s-mcp-auth', () => ({
      rawHttpK8sAuth: (config: any) => {
        return async (req: any, res: any, next: any) => {
          const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
          for (const p of config.publicPaths) {
            if (p.method.toUpperCase() === req.method && p.path === url.pathname) {
              await next();
              return;
            }
          }
          const auth = req.headers.authorization;
          if (auth === 'Bearer valid-token') {
            (req as any).authContext = { user: 'test-user', groups: [] };
            await next();
          } else {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { code: 'UNAUTHENTICATED' } }));
          }
        };
      },
      createDefaultK8sClient: () => ({}),
    }));

    const { startHttpServer } = await import('../src/server.js');
    const httpServer = await startHttpServer(0, authConfig);
    const port = (httpServer.address() as any).port;

    try {
      const res = await fetch(`http://localhost:${port}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 1, params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } } }),
      });
      // Should pass auth and reach MCP handler — expect a valid MCP response (200)
      expect(res.status).toBe(200);
      expect(mockConnect).toHaveBeenCalled();
      expect(mockHandleRequest).toHaveBeenCalled();
    } finally {
      httpServer.close();
    }
  });
});
