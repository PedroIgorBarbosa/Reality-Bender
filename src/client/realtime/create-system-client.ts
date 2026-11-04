import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '../../shared/contracts/system-events';

export type SystemSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function createSystemClient(): SystemSocket {
  return io(window.location.origin, {
    path: '/socket.io',
    autoConnect: false,
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 4000,
    timeout: 5000,
  }) as SystemSocket;
}
