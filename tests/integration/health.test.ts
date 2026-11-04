import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { createHttpApplication } from '../../src/server/app';
import { parseServerConfig } from '../../src/server/config/env';

let server: Server | null = null;
afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server?.close(() => resolve()));
  server = null;
});

describe('servidor HTTP', () => {
  it('responde /api/health sem dados privados e com no-store', async () => {
    const config = parseServerConfig({ NODE_ENV: 'test', CLIENT_ORIGINS: 'http://localhost:5173', PUBLIC_BASE_URL: 'https://private.example.com' });
    const created = createHttpApplication(config);
    server = created.httpServer;
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const base = 'http://127.0.0.1:' + port;
    const response = await fetch(base + '/api/health');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const data: unknown = await response.json();
    expect(data).toEqual({ status: 'ok', service: 'reality-bender-signaling', protocolVersion: 1 });
    expect(JSON.stringify(data)).not.toContain('private.example.com');
    const missing = await fetch(base + '/api/missing');
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ error: 'NOT_FOUND' });
  });
});
