import { describe, expect, it } from 'vitest';
import { createHttpApplication } from '../../src/server/app';
import { parseServerConfig } from '../../src/server/config/env';

describe('HTTP Server & /api/health Integration (Issue #1)', () => {
  it('responde 200 em /api/health com cabeçalhos de segurança e 404 em rotas inexistentes', async () => {
    const config = parseServerConfig({
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: '3000',
      CLIENT_ORIGINS: 'http://localhost:5173',
    });
    const { httpServer } = createHttpApplication(config);

    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', () => resolve()));
    const address = httpServer.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const res = await fetch(`${baseUrl}/api/health`);
      expect(res.status).toBe(200);
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('x-frame-options')).toBe('DENY');
      expect(res.headers.get('x-powered-by')).toBeNull();
      const body = await res.json();
      expect(body).toEqual({
        status: 'ok',
        service: 'reality-bender-signaling',
        protocolVersion: 1,
      });

      const notFound = await fetch(`${baseUrl}/api/unknown`);
      expect(notFound.status).toBe(404);
    } finally {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
  });
});
