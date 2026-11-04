import { describe, expect, it } from 'vitest';
import { SIGNAL_PROTOCOL_VERSION } from '../../src/shared/contracts/system-events';
import { INITIAL_CONNECTION_STATE, reduceConnectionState } from '../../src/shared/types/connection-state';

describe('reduceConnectionState (Issue #1)', () => {
  it('transita corretamente de IDLE -> CONNECTING -> ONLINE', () => {
    const connecting = reduceConnectionState(INITIAL_CONNECTION_STATE, { type: 'CONNECT_STARTED' });
    expect(connecting.phase).toBe('CONNECTING');

    const online = reduceConnectionState(connecting, {
      type: 'READY_VERIFIED',
      protocolVersion: SIGNAL_PROTOCOL_VERSION,
      connectedAt: '2026-11-03T12:00:00.000Z',
    });
    expect(online.phase).toBe('ONLINE');
  });

  it('detecta incompatibilidade de protocolo (PROTOCOL_MISMATCH)', () => {
    const errState = reduceConnectionState(INITIAL_CONNECTION_STATE, {
      type: 'READY_VERIFIED',
      protocolVersion: 999,
      connectedAt: '2026-11-03T12:00:00.000Z',
    });
    expect(errState.phase).toBe('ERROR');
    if (errState.phase === 'ERROR') {
      expect(errState.code).toBe('PROTOCOL_MISMATCH');
    }
  });

  it('trata RECONNECTING, DISCONNECTED e FAILED', () => {
    const reconnecting = reduceConnectionState(INITIAL_CONNECTION_STATE, { type: 'RECONNECTING', attempt: 3 });
    expect(reconnecting).toEqual({ phase: 'RECONNECTING', attempt: 3 });

    const offline = reduceConnectionState(reconnecting, { type: 'DISCONNECTED', reason: 'timeout' });
    expect(offline).toEqual({ phase: 'OFFLINE', reason: 'timeout' });

    const failed = reduceConnectionState(offline, {
      type: 'FAILED',
      code: 'SERVER_UNAVAILABLE',
      message: 'Indisponível',
    });
    expect(failed).toEqual({ phase: 'ERROR', code: 'SERVER_UNAVAILABLE', message: 'Indisponível' });
  });
});
