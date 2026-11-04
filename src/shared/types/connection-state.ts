import { SIGNAL_PROTOCOL_VERSION } from '../contracts/system-events';

export type ConnectionErrorCode = 'SERVER_UNAVAILABLE' | 'HANDSHAKE_FAILED' | 'PROTOCOL_MISMATCH';

export type ConnectionState =
  | { phase: 'IDLE' }
  | { phase: 'CONNECTING' }
  | { phase: 'ONLINE'; protocolVersion: typeof SIGNAL_PROTOCOL_VERSION; connectedAt: string }
  | { phase: 'RECONNECTING'; attempt: number }
  | { phase: 'OFFLINE'; reason: string }
  | { phase: 'ERROR'; code: ConnectionErrorCode; message: string };

export type ConnectionAction =
  | { type: 'CONNECT_STARTED' }
  | { type: 'READY_VERIFIED'; protocolVersion: number; connectedAt: string }
  | { type: 'RECONNECTING'; attempt: number }
  | { type: 'DISCONNECTED'; reason: string }
  | { type: 'FAILED'; code: Exclude<ConnectionErrorCode, 'PROTOCOL_MISMATCH'>; message: string }
  | { type: 'PROTOCOL_MISMATCH' };

export const INITIAL_CONNECTION_STATE: ConnectionState = { phase: 'IDLE' };

export function reduceConnectionState(_previous: ConnectionState, action: ConnectionAction): ConnectionState {
  void _previous;
  switch (action.type) {
    case 'CONNECT_STARTED':
      return { phase: 'CONNECTING' };
    case 'READY_VERIFIED':
      return action.protocolVersion === SIGNAL_PROTOCOL_VERSION
        ? { phase: 'ONLINE', protocolVersion: SIGNAL_PROTOCOL_VERSION, connectedAt: action.connectedAt }
        : { phase: 'ERROR', code: 'PROTOCOL_MISMATCH', message: 'Protocol version mismatch' };
    case 'RECONNECTING':
      return { phase: 'RECONNECTING', attempt: action.attempt };
    case 'DISCONNECTED':
      return { phase: 'OFFLINE', reason: action.reason };
    case 'FAILED':
      return { phase: 'ERROR', code: action.code, message: action.message };
    case 'PROTOCOL_MISMATCH':
      return { phase: 'ERROR', code: 'PROTOCOL_MISMATCH', message: 'Protocol version mismatch' };
  }
}
