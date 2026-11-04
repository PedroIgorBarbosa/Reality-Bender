#!/usr/bin/env node
import assert from 'node:assert/strict';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');

async function runSmoke() {
  const { parseServerConfig } = await import(pathToFileURL(join(ROOT, 'dist/server/server/config/env.js')).href);
  const { createHttpApplication } = await import(pathToFileURL(join(ROOT, 'dist/server/server/app.js')).href);
  const { attachSystemSocket } = await import(pathToFileURL(join(ROOT, 'dist/server/server/realtime/system-socket.js')).href);
  const { io: ClientIO } = await import('socket.io-client');

  const config = parseServerConfig({
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    PORT: '3099',
    CLIENT_ORIGINS: 'https://stage.reality-bender.local',
    PUBLIC_BASE_URL: 'https://stage.reality-bender.local',
  });

  const { httpServer } = createHttpApplication(config);
  const io = attachSystemSocket(httpServer, config);

  await new Promise((res, rej) => {
    httpServer.once('error', rej);
    httpServer.listen(0, '127.0.0.1', () => res());
  });

  const addr = httpServer.address();
  const port = typeof addr === 'object' && addr ? addr.port : 3099;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Health endpoint
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    const healthJson = await healthRes.json();
    assert.equal(healthJson.status, 'ok');
    assert.equal(healthJson.protocolVersion, 1);

    // 2. SPA routes /stage and /control
    const stageRes = await fetch(`${baseUrl}/stage`, { headers: { Accept: 'text/html' } });
    assert.equal(stageRes.status, 200);
    const stageHtml = await stageRes.text();
    assert(stageHtml.includes('<div id="root"></div>'));

    // 3. Socket.IO handshake + session creation + pairing
    const stageClient = ClientIO(baseUrl, {
      path: '/socket.io',
      autoConnect: false,
      extraHeaders: { origin: 'https://stage.reality-bender.local' },
    });

    await new Promise((res, rej) => {
      const timeout = setTimeout(() => rej(new Error('Socket timeout')), 4000);
      stageClient.on('system:ready', (ready) => {
        assert.equal(ready.protocolVersion, 1);
        stageClient.emit('system:ping', { requestId: 'smoke-ping-1' }, (ack) => {
          assert.equal(ack.ok, true);
          assert.equal(ack.requestId, 'smoke-ping-1');
          stageClient.emit('session:create', { publicBaseUrl: 'https://stage.reality-bender.local' }, (sessAck) => {
            assert.equal(sessAck.ok, true);
            assert.match(sessAck.session.pairingCode, /^[0-9]{6}$/);
            clearTimeout(timeout);
            res();
          });
        });
      });
      stageClient.connect();
    });

    stageClient.disconnect();
    console.log('[smoke:server] OK — HTTP /api/health, rotas SPA (/stage, /control), Socket.IO handshake e criação de sessão validados.');
  } finally {
    await new Promise((res) => io.close(() => res()));
    if (httpServer.listening) {
      await new Promise((res) => httpServer.close(() => res()));
    }
  }
}

runSmoke().catch((err) => {
  console.error('[smoke:server] FALHA:', err);
  process.exit(1);
});
