import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SIGNAL_PROTOCOL_VERSION,
  SIGNAL_SERVICE_NAME,
  type SystemPingAck,
  type SystemReadyPayload,
} from '../../shared/contracts/system-events';
import {
  INITIAL_CONNECTION_STATE,
  reduceConnectionState,
  type ConnectionAction,
  type ConnectionState,
} from '../../shared/types/connection-state';
import { createSystemClient, type SystemSocket } from '../realtime/create-system-client';

const HANDSHAKE_TIMEOUT_MS = 3500;

export interface SystemConnection {
  state: ConnectionState;
  socket: SystemSocket | null;
  signalingRttMs: number | null;
  reconnect: () => void;
}

function validReady(payload: unknown): payload is SystemReadyPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'protocolVersion' in payload &&
    (payload as SystemReadyPayload).protocolVersion === SIGNAL_PROTOCOL_VERSION &&
    'service' in payload &&
    (payload as SystemReadyPayload).service === SIGNAL_SERVICE_NAME
  );
}

function validAcknowledgement(ack: unknown, requestId: string): ack is SystemPingAck {
  return (
    typeof ack === 'object' &&
    ack !== null &&
    'ok' in ack &&
    (ack as SystemPingAck).ok === true &&
    'requestId' in ack &&
    (ack as SystemPingAck).requestId === requestId &&
    'protocolVersion' in ack &&
    (ack as SystemPingAck).protocolVersion === SIGNAL_PROTOCOL_VERSION
  );
}

export function useSystemConnection(): SystemConnection {
  const [state, setState] = useState<ConnectionState>(INITIAL_CONNECTION_STATE);
  const [signalingRttMs, setSignalingRttMs] = useState<number | null>(null);
  const socketRef = useRef<SystemSocket | null>(null);

  useEffect(() => {
    let active = true;
    let sequence = 0;
    let preserveError = false;
    let handshakeTimer: ReturnType<typeof setTimeout> | null = null;
    const socket = createSystemClient();
    socketRef.current = socket;

    const update = (action: ConnectionAction) => {
      if (active) setState((previous) => reduceConnectionState(previous, action));
    };
    const clearHandshakeTimer = () => {
      if (handshakeTimer !== null) clearTimeout(handshakeTimer);
      handshakeTimer = null;
    };
    const failHandshake = () => {
      ++sequence;
      clearHandshakeTimer();
      preserveError = true;
      socket.disconnect();
      update({
        type: 'FAILED',
        code: 'HANDSHAKE_FAILED',
        message: 'Falha ao verificar o servidor. Reconecte.',
      });
    };

    const onConnect = () => {
      ++sequence;
      preserveError = false;
      update({ type: 'CONNECT_STARTED' });
      clearHandshakeTimer();
      handshakeTimer = setTimeout(failHandshake, HANDSHAKE_TIMEOUT_MS);
    };
    const onReady = (payload: unknown) => {
      if (!active || !socket.connected) return;
      if (!validReady(payload)) {
        ++sequence;
        preserveError = true;
        clearHandshakeTimer();
        socket.disconnect();
        update({ type: 'PROTOCOL_MISMATCH' });
        return;
      }
      const thisHandshake = ++sequence;
      const bytes = new Uint8Array(16);
      if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        crypto.getRandomValues(bytes);
      } else {
        for (let i = 0; i < 16; i++) bytes[i] = (i * 17 + 43) & 0xff;
      }
      const requestId = Array.from(bytes, (n) => n.toString(16).padStart(2, '0')).join('');
      const pingStart = Date.now();
      clearHandshakeTimer();
      handshakeTimer = setTimeout(failHandshake, HANDSHAKE_TIMEOUT_MS);
      socket.emit('system:ping', { requestId }, (ack) => {
        if (!active || !socket.connected || thisHandshake !== sequence) return;
        if (!validAcknowledgement(ack, requestId)) {
          failHandshake();
          return;
        }
        clearHandshakeTimer();
        setSignalingRttMs(Math.max(1, Date.now() - pingStart));
        update({
          type: 'READY_VERIFIED',
          protocolVersion: SIGNAL_PROTOCOL_VERSION,
          connectedAt: new Date().toISOString(),
        });
      });
    };
    const onDisconnect = () => {
      ++sequence;
      clearHandshakeTimer();
      if (!preserveError) {
        update({ type: 'DISCONNECTED', reason: 'A conexão com o servidor foi encerrada.' });
      }
    };
    const onConnectError = () => {
      ++sequence;
      clearHandshakeTimer();
      update({
        type: 'FAILED',
        code: 'SERVER_UNAVAILABLE',
        message: 'Servidor indisponível ou origem não autorizada.',
      });
    };
    const onReconnectAttempt = (attempt: number) => {
      update({ type: 'RECONNECTING', attempt });
    };

    socket.on('connect', onConnect);
    socket.on('system:ready', onReady);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.io.on('reconnect_attempt', onReconnectAttempt);
    update({ type: 'CONNECT_STARTED' });
    socket.connect();

    return () => {
      active = false;
      ++sequence;
      clearHandshakeTimer();
      socket.off('connect', onConnect);
      socket.off('system:ready', onReady);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.io.off('reconnect_attempt', onReconnectAttempt);
      socket.disconnect();
    };
  }, []);

  const reconnect = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    if (socket.connected) {
      socket.disconnect();
    }
    socket.connect();
  }, []);

  return { state, socket: socketRef.current, signalingRttMs, reconnect };
}
