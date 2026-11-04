import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import {
  SIGNAL_PROTOCOL_VERSION,
  SIGNAL_SERVICE_NAME,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SystemPingAck,
} from '../../shared/contracts/system-events';
import type { ServerConfig } from '../config/env';

function validatePing(payload: unknown): string | null {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const requestId = (payload as Record<string, unknown>).requestId;
  if (typeof requestId !== 'string' || requestId.length < 1 || requestId.length > 64) return null;
  if (/[^\x20-\x7e]/.test(requestId)) return null;
  return requestId;
}

export function attachSystemSocket(httpServer: HttpServer, config: ServerConfig) {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    path: '/socket.io',
    maxHttpBufferSize: 16 * 1024,
    cors: { origin: [...config.allowedOrigins], methods: ['GET', 'POST'], credentials: false },
    allowRequest: (request, done) => {
      const origin = request.headers.origin;
      done(null, typeof origin === 'string' && config.allowedOrigins.includes(origin));
    },
  });
  io.on('connection', (socket) => {
    socket.emit('system:ready', {
      protocolVersion: SIGNAL_PROTOCOL_VERSION,
      service: SIGNAL_SERVICE_NAME,
    });
    socket.on('system:ping', (payload: unknown, acknowledge) => {
      if (typeof acknowledge !== 'function') return;
      const requestId = validatePing(payload);
      const result: SystemPingAck = {
        ok: requestId !== null,
        requestId: requestId ?? '',
        protocolVersion: SIGNAL_PROTOCOL_VERSION,
      };
      acknowledge(result);
    });
  });
  return io;
}
