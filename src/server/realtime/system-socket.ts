import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import {
  SIGNAL_PROTOCOL_VERSION,
  SIGNAL_SERVICE_NAME,
  type ClientToServerEvents,
  type ControlCommandPayload,
  type RtcSignalPayload,
  type ServerToClientEvents,
  type SessionJoinPayload,
  type SystemPingAck,
} from '../../shared/contracts/system-events';
import type { ServerConfig } from '../config/env';
import { SessionManager } from './session-manager';

function validatePing(payload: unknown): string | null {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const requestId = (payload as Record<string, unknown>).requestId;
  if (typeof requestId !== 'string' || requestId.length < 1 || requestId.length > 64) return null;
  if (/[^\x20-\x7e]/.test(requestId)) return null;
  return requestId;
}

export function attachSystemSocket(httpServer: HttpServer, config: ServerConfig, sessionManager = new SessionManager()) {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    path: '/socket.io',
    maxHttpBufferSize: 64 * 1024,
    cors: { origin: [...config.allowedOrigins], methods: ['GET', 'POST'], credentials: false },
    allowRequest: (request, done) => {
      const origin = request.headers.origin;
      done(null, typeof origin === 'string' && config.allowedOrigins.includes(origin));
    },
  });

  const defaultBaseUrl = config.publicBaseUrl ?? config.allowedOrigins[0] ?? `http://${config.host}:${config.port}`;

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
        serverTimeMs: Date.now(),
      };
      acknowledge(result);
    });

    const handleCreateSession = (
      payload: { publicBaseUrl?: string; sessionId?: string } | undefined,
      acknowledge?: (ack: ReturnType<SessionManager['createSession']>) => void,
    ) => {
      if (payload?.sessionId) {
        const refreshed = sessionManager.regeneratePairingCode(payload.sessionId, socket.id);
        if (refreshed.ok && refreshed.qr && refreshed.session) {
          socket.emit('pairing:code_generated', refreshed.qr);
          socket.emit('session:created', { session: refreshed.session, qr: refreshed.qr });
        }
        if (typeof acknowledge === 'function') acknowledge(refreshed);
        return;
      }
      const created = sessionManager.createSession(socket.id, payload?.publicBaseUrl || defaultBaseUrl);
      if (created.ok && created.session && created.qr) {
        socket.join(created.session.sessionId);
        socket.emit('session:created', { session: created.session, qr: created.qr });
        socket.emit('pairing:code_generated', created.qr);
      }
      if (typeof acknowledge === 'function') acknowledge(created);
    };

    socket.on('session:create', handleCreateSession);
    socket.on('pairing:request_code', handleCreateSession);

    const handleJoin = (payload: SessionJoinPayload, acknowledge?: (ack: ReturnType<SessionManager['joinSession']>) => void) => {
      const joined = sessionManager.joinSession(socket.id, payload);
      if (!joined.ok || !joined.session) {
        socket.emit('pairing:failed', {
          error: joined.error ?? 'INVALID_CODE',
          message: joined.message ?? 'Falha ao parear.',
        });
        if (typeof acknowledge === 'function') acknowledge(joined);
        return;
      }
      socket.join(joined.session.sessionId);
      io.to(joined.session.sessionId).emit('session:joined', joined.session);
      io.to(joined.session.sessionId).emit('pairing:success', joined.session);
      io.to(joined.session.sessionId).emit('session:state', joined.session);
      if (typeof acknowledge === 'function') acknowledge(joined);
    };

    socket.on('session:join', handleJoin);
    socket.on('pairing:submit_code', (payload, acknowledge) => {
      handleJoin(
        {
          pairingCode: payload?.code,
          inviteToken: payload?.inviteToken,
          reconnectToken: payload?.reconnectToken,
          role: 'mobile',
        },
        acknowledge,
      );
    });

    socket.on('session:leave', (payload, acknowledge) => {
      const affected = sessionManager.LeaveBySocket(socket.id);
      if (affected) {
        socket.leave(affected.sessionId);
        io.to(affected.sessionId).emit('session:state', sessionManager.toPublicInfo(affected));
      } else if (payload?.sessionId) {
        socket.leave(payload.sessionId);
      }
      if (typeof acknowledge === 'function') acknowledge({ ok: true });
    });

    const relayWebRtc = (
      eventName: 'rtc:offer' | 'webrtc:offer' | 'rtc:answer' | 'webrtc:answer' | 'rtc:ice' | 'rtc:ice-candidate' | 'webrtc:ice-candidate',
      payload: RtcSignalPayload,
      acknowledge?: (ack: { ok: boolean; error?: string }) => void,
    ) => {
      if (!payload || typeof payload.sessionId !== 'string') {
        if (typeof acknowledge === 'function') acknowledge({ ok: false, error: 'INVALID_PAYLOAD' });
        return;
      }
      const session = sessionManager.verifyPeerMembership(socket.id, payload.sessionId);
      if (!session) {
        if (typeof acknowledge === 'function') acknowledge({ ok: false, error: 'UNAUTHORIZED_SESSION' });
        return;
      }
      if (eventName.includes('offer')) {
        const updated = sessionManager.updatePhase(session.sessionId, 'NEGOTIATING');
        if (updated) io.to(session.sessionId).emit('session:state', updated);
      } else if (eventName.includes('answer')) {
        const updated = sessionManager.updatePhase(session.sessionId, 'LIVE');
        if (updated) io.to(session.sessionId).emit('session:state', updated);
      }
      socket.to(session.sessionId).emit(eventName, payload);
      // Emit canonical alias too so both naming conventions work seamlessly
      if (eventName === 'webrtc:offer') socket.to(session.sessionId).emit('rtc:offer', payload);
      if (eventName === 'rtc:offer') socket.to(session.sessionId).emit('webrtc:offer', payload);
      if (eventName === 'webrtc:answer') socket.to(session.sessionId).emit('rtc:answer', payload);
      if (eventName === 'rtc:answer') socket.to(session.sessionId).emit('webrtc:answer', payload);
      if (eventName === 'webrtc:ice-candidate' || eventName === 'rtc:ice-candidate') {
        socket.to(session.sessionId).emit('rtc:ice', payload);
      }
      if (eventName === 'rtc:ice') {
        socket.to(session.sessionId).emit('rtc:ice-candidate', payload);
      }
      if (typeof acknowledge === 'function') acknowledge({ ok: true });
    };

    socket.on('rtc:offer', (p, ack) => relayWebRtc('rtc:offer', p, ack));
    socket.on('webrtc:offer', (p, ack) => relayWebRtc('webrtc:offer', p, ack));
    socket.on('rtc:answer', (p, ack) => relayWebRtc('rtc:answer', p, ack));
    socket.on('webrtc:answer', (p, ack) => relayWebRtc('webrtc:answer', p, ack));
    socket.on('rtc:ice', (p, ack) => relayWebRtc('rtc:ice', p, ack));
    socket.on('rtc:ice-candidate', (p, ack) => relayWebRtc('rtc:ice-candidate', p, ack));
    socket.on('webrtc:ice-candidate', (p, ack) => relayWebRtc('webrtc:ice-candidate', p, ack));

    const handleControlCommand = (
      payload: ControlCommandPayload,
      acknowledge?: (ack: { ok: boolean; commandId: string; appliedAt: string; session?: ReturnType<SessionManager['toPublicInfo']>; error?: string }) => void,
    ) => {
      if (!payload || typeof payload.sessionId !== 'string' || typeof payload.commandId !== 'string') {
        if (typeof acknowledge === 'function') {
          acknowledge({ ok: false, commandId: payload?.commandId ?? '', appliedAt: new Date().toISOString(), error: 'INVALID_COMMAND' });
        }
        return;
      }
      const updated = sessionManager.applyControlCommand(socket.id, payload.sessionId, {
        effectMode: payload.effectMode,
        quality: payload.quality,
        mirrored: payload.mirrored,
      });
      if (!updated) {
        if (typeof acknowledge === 'function') {
          acknowledge({ ok: false, commandId: payload.commandId, appliedAt: new Date().toISOString(), error: 'UNAUTHORIZED_SESSION' });
        }
        return;
      }
      socket.to(payload.sessionId).emit('control:command', payload);
      socket.to(payload.sessionId).emit('stage:set-mode', payload);
      io.to(payload.sessionId).emit('session:state', updated);
      if (typeof acknowledge === 'function') {
        acknowledge({
          ok: true,
          commandId: payload.commandId,
          appliedAt: new Date().toISOString(),
          session: updated,
        });
      }
    };

    socket.on('control:command', handleControlCommand);
    socket.on('stage:set-mode', handleControlCommand);

    socket.on('disconnect', () => {
      const affected = sessionManager.LeaveBySocket(socket.id);
      if (affected) {
        io.to(affected.sessionId).emit('session:state', sessionManager.toPublicInfo(affected));
      }
    });
  });

  return io;
}
