import type { AddressInfo } from 'node:net';
import type { Server as HttpServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents, SystemPingAck, SystemReadyPayload } from '../../src/shared/contracts/system-events';
import { createHttpApplication } from '../../src/server/app';
import { parseServerConfig } from '../../src/server/config/env';
import { attachSystemSocket } from '../../src/server/realtime/system-socket';

let server: HttpServer | null = null;
let ioServer: ReturnType<typeof attachSystemSocket> | null = null;
let client: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

afterEach(async () => {
  client?.disconnect();
  if (ioServer) await new Promise<void>((resolve) => ioServer?.close(() => resolve()));
  else if (server?.listening) await new Promise<void>((resolve) => server?.close(() => resolve()));
  client = null;
  ioServer = null;
  server = null;
});

async function setup() {
  const config = parseServerConfig({ NODE_ENV: 'test', CLIENT_ORIGINS: 'http://localhost:5173' });
  const created = createHttpApplication(config);
  server = created.httpServer;
  ioServer = attachSystemSocket(server, config);
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
  return 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
}

describe('Socket.IO técnico', () => {
  it('envia ready, valida ping/ack e rejeita payload inválido', async () => {
    const url = await setup();
    client = io<ServerToClientEvents, ClientToServerEvents>(url, {
      path: '/socket.io', transports: ['websocket'], autoConnect: false, reconnection: false,
      extraHeaders: { Origin: 'http://localhost:5173' },
    });
    const ready = new Promise<SystemReadyPayload>((resolve, reject) => {
      client?.once('system:ready', resolve);
      client?.once('connect_error', reject);
    });
    client.connect();
    expect(await ready).toEqual({ protocolVersion: 1, service: 'reality-bender-signaling' });
    const ping: SystemPingAck = await new Promise((resolve) => {
      client?.emit('system:ping', { requestId: 'test-123' }, resolve);
    });
    expect(ping).toEqual({ ok: true, requestId: 'test-123', protocolVersion: 1 });
    const invalid: SystemPingAck = await new Promise((resolve) => {
      client?.emit('system:ping', { requestId: 'a'.repeat(65) }, resolve);
    });
    expect(invalid).toEqual({ ok: false, requestId: '', protocolVersion: 1 });
    const malformed: SystemPingAck = await new Promise((resolve) => {
      client?.emit('system:ping', null, resolve);
    });
    expect(malformed.ok).toBe(false);
  });

  it('recusa origem não autorizada no handshake', async () => {
    const url = await setup();
    client = io<ServerToClientEvents, ClientToServerEvents>(url, {
      path: '/socket.io', transports: ['websocket'], autoConnect: false, reconnection: false,
      extraHeaders: { Origin: 'https://unauthorized.example.com' },
    });
    const connectionError = new Promise<Error>((resolve, reject) => {
      client?.once('connect_error', resolve);
      client?.once('connect', () => reject(new Error('Origem não autorizada foi aceita')));
    });
    client.connect();
    expect((await connectionError).message).toBeTruthy();
    expect(client.connected).toBe(false);
  });
});
