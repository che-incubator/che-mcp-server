import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('parseConfig', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.CHE_MCP_TRANSPORT;
    delete process.env.CHE_MCP_PORT;
    delete process.env.CHE_MCP_AUTH_ENABLED;
    delete process.env.NAMESPACE;
  });

  it('returns defaults when no args or env', async () => {
    const { parseConfig } = await import('../src/config.js');
    const config = parseConfig([]);
    expect(config).toEqual({
      transport: 'stdio',
      port: 8080,
      authEnabled: false,
      namespace: '',
    });
  });

  it('reads transport from env var', async () => {
    process.env.CHE_MCP_TRANSPORT = 'http';
    const { parseConfig } = await import('../src/config.js');
    const config = parseConfig([]);
    expect(config.transport).toBe('http');
  });

  it('reads port from env var', async () => {
    process.env.CHE_MCP_PORT = '9090';
    const { parseConfig } = await import('../src/config.js');
    const config = parseConfig([]);
    expect(config.port).toBe(9090);
  });

  it('CLI flag overrides env var for transport', async () => {
    process.env.CHE_MCP_TRANSPORT = 'stdio';
    const { parseConfig } = await import('../src/config.js');
    const config = parseConfig(['--transport', 'http']);
    expect(config.transport).toBe('http');
  });

  it('CLI flag overrides env var for port', async () => {
    process.env.CHE_MCP_PORT = '9090';
    const { parseConfig } = await import('../src/config.js');
    const config = parseConfig(['--port', '3000']);
    expect(config.port).toBe(3000);
  });

  it('throws on invalid transport value', async () => {
    const { parseConfig } = await import('../src/config.js');
    expect(() => parseConfig(['--transport', 'invalid'])).toThrow();
  });

  it('defaults authEnabled to true when transport is http', async () => {
    process.env.CHE_MCP_TRANSPORT = 'http';
    const { parseConfig } = await import('../src/config.js');
    const config = parseConfig([]);
    expect(config.authEnabled).toBe(true);
  });

  it('forces authEnabled to false when transport is stdio', async () => {
    process.env.CHE_MCP_AUTH_ENABLED = 'true';
    const { parseConfig } = await import('../src/config.js');
    const config = parseConfig([]);
    expect(config.transport).toBe('stdio');
    expect(config.authEnabled).toBe(false);
  });

  it('reads CHE_MCP_AUTH_ENABLED=false override', async () => {
    process.env.CHE_MCP_TRANSPORT = 'http';
    process.env.CHE_MCP_AUTH_ENABLED = 'false';
    const { parseConfig } = await import('../src/config.js');
    const config = parseConfig([]);
    expect(config.authEnabled).toBe(false);
  });

  it('reads NAMESPACE from env var', async () => {
    process.env.NAMESPACE = 'my-ns';
    const { parseConfig } = await import('../src/config.js');
    const config = parseConfig([]);
    expect(config.namespace).toBe('my-ns');
  });

  it('namespace is empty string when not set and not in-cluster', async () => {
    const { parseConfig } = await import('../src/config.js');
    const config = parseConfig([]);
    expect(config.namespace).toBe('');
  });
});
