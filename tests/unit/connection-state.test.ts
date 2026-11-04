import { describe, expect, it } from 'vitest';
import { INITIAL_CONNECTION_STATE, reduceConnectionState } from '../../src/shared/types/connection-state';

describe('máquina de estados da sinalização', () => {
  it('inicia IDLE e não declara ONLINE antes do handshake', () => {
    expect(INITIAL_CONNECTION_STATE.phase).toBe('IDLE');
    expect(reduceConnectionState(INITIAL_CONNECTION_STATE, { type: 'CONNECT_STARTED' })).toEqual({ phase: 'CONNECTING' });
  });
  it('declara ONLINE somente com protocolo 1 verificado', () => {
    const connected = reduceConnectionState(INITIAL_CONNECTION_STATE, {
      type: 'READY_VERIFIED', protocolVersion: 1, connectedAt: '2026-11-03T00:00:00.000Z',
    });
    expect(connected).toEqual({ phase: 'ONLINE', protocolVersion: 1, connectedAt: '2026-11-03T00:00:00.000Z' });
    expect(reduceConnectionState(connected, {
      type: 'READY_VERIFIED', protocolVersion: 2, connectedAt: '2026-11-03T00:00:00.000Z',
    })).toMatchObject({ phase: 'ERROR', code: 'PROTOCOL_MISMATCH' });
  });
  it('transiciona para OFFLINE, RECONNECTING e ERROR sem falsos positivos', () => {
    const offline = reduceConnectionState(INITIAL_CONNECTION_STATE, { type: 'DISCONNECTED', reason: 'Fim de conexão' });
    expect(offline.phase).toBe('OFFLINE');
    expect(reduceConnectionState(offline, { type: 'RECONNECTING', attempt: 3 })).toEqual({ phase: 'RECONNECTING', attempt: 3 });
    expect(reduceConnectionState(offline, { type: 'PROTOCOL_MISMATCH' })).toMatchObject({ phase: 'ERROR', code: 'PROTOCOL_MISMATCH' });
  });
});
