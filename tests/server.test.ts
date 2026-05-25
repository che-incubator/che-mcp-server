import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'node:http';

describe('startHttpServer', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('responds 200 on GET /healthz', async () => {
    vi.doMock('../src/tools.js', () => ({
      createMcpServer: () => ({ connect: vi.fn() }),
    }));

    const { startHttpServer } = await import('../src/server.js');
    const httpServer = await startHttpServer(0); // port 0 = random available
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
    const httpServer = await startHttpServer(0);
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
    const httpServer = await startHttpServer(0);
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
