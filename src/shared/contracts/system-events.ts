export const SIGNAL_PROTOCOL_VERSION = 1 as const;
export const SIGNAL_SERVICE_NAME = 'reality-bender-signaling' as const;

export type SessionRole = 'stage' | 'mobile';
export type SessionPhase =
  | 'NO_SESSION'
  | 'WAITING'
  | 'PAIRED'
  | 'NEGOTIATING'
  | 'LIVE'
  | 'INTERRUPTED'
  | 'CLOSED';

export type EffectMode = 'NONE' | 'ENERGY' | 'PORTAL' | 'AURA';
export type RenderQuality = 'HIGH' | 'MEDIUM' | 'COMPAT';

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
  serverTimeMs?: number;
}

export interface PairingQRData {
  sessionId: string;
  pairingCode: string;
  inviteToken: string;
  joinUrl: string;
  expiresAt: string;
  ttlMs: number;
}

export interface SessionInfoPayload {
  sessionId: string;
  phase: SessionPhase;
  pairingCode: string;
  inviteToken?: string;
  joinUrl: string;
  expiresAt: string;
  mobileConnected: boolean;
  stageConnected: boolean;
  effectMode: EffectMode;
  quality: RenderQuality;
  mirrored: boolean;
  updatedAt: string;
}

export interface SessionCreateAck {
  ok: boolean;
  session?: SessionInfoPayload;
  qr?: PairingQRData;
  stageToken?: string;
  error?: string;
}

export interface SessionJoinPayload {
  sessionId?: string;
  pairingCode?: string;
  inviteToken?: string;
  reconnectToken?: string;
  role: SessionRole;
}

export interface SessionJoinAck {
  ok: boolean;
  session?: SessionInfoPayload;
  reconnectToken?: string;
  error?: 'INVALID_CODE' | 'SESSION_EXPIRED' | 'MOBILE_ALREADY_ACTIVE' | 'SESSION_NOT_FOUND' | 'UNAUTHORIZED';
  message?: string;
}

export interface RtcSignalPayload {
  sessionId: string;
  sdp?: { type: 'offer' | 'answer'; sdp: string };
  candidate?: {
    candidate: string;
    sdpMid?: string | null;
    sdpMLineIndex?: number | null;
    usernameFragment?: string | null;
  };
}

export interface RtcSignalAck {
  ok: boolean;
  error?: string;
}

export interface ControlCommandPayload {
  sessionId: string;
  commandId: string;
  type: 'SET_EFFECT' | 'SET_QUALITY' | 'TOGGLE_MIRROR' | 'CALIBRATE' | 'RECONNECT_RTC' | 'STOP_SESSION';
  effectMode?: EffectMode;
  quality?: RenderQuality;
  mirrored?: boolean;
}

export interface ControlCommandAck {
  ok: boolean;
  commandId: string;
  appliedAt: string;
  session?: SessionInfoPayload;
  error?: string;
}

export interface ClientToServerEvents {
  'system:ping': (payload: unknown, acknowledge: (ack: SystemPingAck) => void) => void;
  'session:create': (payload: { publicBaseUrl?: string } | undefined, acknowledge: (ack: SessionCreateAck) => void) => void;
  'pairing:request_code': (payload: { sessionId?: string }, acknowledge: (ack: SessionCreateAck) => void) => void;
  'session:join': (payload: SessionJoinPayload, acknowledge: (ack: SessionJoinAck) => void) => void;
  'pairing:submit_code': (payload: { code: string; inviteToken?: string; reconnectToken?: string }, acknowledge: (ack: SessionJoinAck) => void) => void;
  'session:leave': (payload: { sessionId: string }, acknowledge?: (ack: { ok: boolean }) => void) => void;
  'rtc:offer': (payload: RtcSignalPayload, acknowledge?: (ack: RtcSignalAck) => void) => void;
  'webrtc:offer': (payload: RtcSignalPayload, acknowledge?: (ack: RtcSignalAck) => void) => void;
  'rtc:answer': (payload: RtcSignalPayload, acknowledge?: (ack: RtcSignalAck) => void) => void;
  'webrtc:answer': (payload: RtcSignalPayload, acknowledge?: (ack: RtcSignalAck) => void) => void;
  'rtc:ice': (payload: RtcSignalPayload, acknowledge?: (ack: RtcSignalAck) => void) => void;
  'rtc:ice-candidate': (payload: RtcSignalPayload, acknowledge?: (ack: RtcSignalAck) => void) => void;
  'webrtc:ice-candidate': (payload: RtcSignalPayload, acknowledge?: (ack: RtcSignalAck) => void) => void;
  'control:command': (payload: ControlCommandPayload, acknowledge: (ack: ControlCommandAck) => void) => void;
  'stage:set-mode': (payload: ControlCommandPayload, acknowledge: (ack: ControlCommandAck) => void) => void;
}

export interface ServerToClientEvents {
  'system:ready': (payload: SystemReadyPayload) => void;
  'session:created': (payload: { session: SessionInfoPayload; qr: PairingQRData }) => void;
  'pairing:code_generated': (payload: PairingQRData) => void;
  'session:joined': (payload: SessionInfoPayload) => void;
  'pairing:success': (payload: SessionInfoPayload) => void;
  'pairing:expired': (payload: { sessionId: string; reason: string }) => void;
  'pairing:failed': (payload: { error: string; message: string }) => void;
  'session:state': (payload: SessionInfoPayload) => void;
  'rtc:offer': (payload: RtcSignalPayload) => void;
  'webrtc:offer': (payload: RtcSignalPayload) => void;
  'rtc:answer': (payload: RtcSignalPayload) => void;
  'webrtc:answer': (payload: RtcSignalPayload) => void;
  'rtc:ice': (payload: RtcSignalPayload) => void;
  'rtc:ice-candidate': (payload: RtcSignalPayload) => void;
  'webrtc:ice-candidate': (payload: RtcSignalPayload) => void;
  'control:command': (payload: ControlCommandPayload) => void;
  'stage:set-mode': (payload: ControlCommandPayload) => void;
}
