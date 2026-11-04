import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSystemConnection } from '../../src/client/hooks/use-system-connection';
import { createSystemClient, type SystemSocket } from '../../src/client/realtime/create-system-client';

vi.mock('../../src/client/realtime/create-system-client', () => ({
  createSystemClient: vi.fn(),
}));

type Listener = (...args: unknown[]) => void;

class FakeEvents {
  private readonly listeners = new Map<string, Set<Listener>>();
  on(event: string, callback: Listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)?.add(callback);
    return this;
  }
  off(event: string, callback: Listener) {
    this.listeners.get(event)?.delete(callback);
    return this;
  }
  fire(event: string, ...args: unknown[]) {
    for (const callback of this.listeners.get(event) ?? []) callback(...args);
  }
  count(event: string) { return this.listeners.get(event)?.size ?? 0; }
}

class FakeSocket extends FakeEvents {
  readonly io = new FakeEvents();
  connected = false;
  disconnectCalls = 0;
  connect() {
    this.connected = true;
    this.fire('connect');
    return this;
  }
  disconnect() {
    ++this.disconnectCalls;
    if (this.connected) {
      this.connected = false;
      this.fire('disconnect', 'io client disconnect');
    }
    return this;
  }
  emit(event: string, payload: { requestId: string }, callback: (value: unknown) => void) {
    if (event === 'system:ping') callback({ ok: true, requestId: payload.requestId, protocolVersion: 1 });
    return this;
  }
}

let fake: FakeSocket;
beforeEach(() => {
  fake = new FakeSocket();
  vi.mocked(createSystemClient).mockReturnValue(fake as unknown as SystemSocket);
});
afterEach(() => vi.clearAllMocks());

describe('lifecycle de useSystemConnection', () => {
  it('espera ready + ping, marca online e remove listeners após unmount', () => {
    const { result, unmount } = renderHook(() => useSystemConnection());
    expect(result.current.state.phase).toBe('CONNECTING');

    act(() => fake.fire('system:ready', { protocolVersion: 1, service: 'reality-bender-signaling' }));
    expect(result.current.state.phase).toBe('ONLINE');
    expect(fake.count('system:ready')).toBe(1);

    unmount();
    expect(fake.count('system:ready')).toBe(0);
    expect(fake.io.count('reconnect_attempt')).toBe(0);
    expect(fake.disconnectCalls).toBe(1);

    fake.fire('system:ready', { protocolVersion: 1, service: 'reality-bender-signaling' });
    expect(fake.count('system:ready')).toBe(0);
  });

  it('recusa protocolo incompatível e oferece reconexão efetiva', () => {
    const { result, unmount } = renderHook(() => useSystemConnection());
    act(() => fake.fire('system:ready', { protocolVersion: 2, service: 'reality-bender-signaling' }));
    expect(result.current.state).toMatchObject({ phase: 'ERROR', code: 'PROTOCOL_MISMATCH' });
    act(() => result.current.reconnect());
    expect(result.current.state.phase).toBe('CONNECTING');
    unmount();
  });
});
