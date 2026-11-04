import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '../../shared/contracts/system-events';

export type SystemSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function createSystemClient(baseUrl?: string): SystemSocket {
  const origin =
    baseUrl ??
    (typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'http://127.0.0.1:3000');

  return io(origin, {
    path: '/socket.io',
    autoConnect: false,
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 4000,
    timeout: 5000,
  }) as SystemSocket;
}
