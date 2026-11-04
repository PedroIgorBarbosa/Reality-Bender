export const SIGNAL_PROTOCOL_VERSION = 1 as const;
export const SIGNAL_SERVICE_NAME = 'reality-bender-signaling' as const;

export interface SystemReadyPayload {
  protocolVersion: typeof SIGNAL_PROTOCOL_VERSION;
  service: typeof SIGNAL_SERVICE_NAME;
}

export interface SystemPingPayload {
  requestId: string;
}

export interface SystemPingAck {
  ok: boolean;
  requestId: string;
  protocolVersion: typeof SIGNAL_PROTOCOL_VERSION;
}

export interface ClientToServerEvents {
  'system:ping': (payload: unknown, acknowledge: (ack: SystemPingAck) => void) => void;
}

export interface ServerToClientEvents {
  'system:ready': (payload: SystemReadyPayload) => void;
}
