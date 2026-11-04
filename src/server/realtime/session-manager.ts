import { randomBytes, timingSafeEqual } from 'node:crypto';
import type {
  EffectMode,
  PairingQRData,
  RenderQuality,
  SessionCreateAck,
  SessionInfoPayload,
  SessionJoinAck,
  SessionJoinPayload,
  SessionPhase,
} from '../../shared/contracts/system-events';

export const DEFAULT_PAIRING_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface ManagedSession {
  sessionId: string;
  pairingCode: string;
  inviteToken: string;
  stageToken: string;
  mobileReconnectToken: string;
  publicBaseUrl: string;
  createdAt: number;
  expiresAt: number;
  updatedAt: number;
  phase: SessionPhase;
  stageSocketId: string | null;
  mobileSocketId: string | null;
  effectMode: EffectMode;
  quality: RenderQuality;
  mirrored: boolean;
}

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function generatePinCode(existingCodes: Set<string>): string {
  for (let i = 0; i < 50; i++) {
    const num = randomBytes(4).readUInt32BE(0) % 1_000_000;
    const pin = String(num).padStart(6, '0');
    if (!existingCodes.has(pin)) return pin;
  }
  return String(Math.floor(100000 + Math.random() * 900000));
}

export class SessionManager {
  private readonly sessions = new Map<string, ManagedSession>();
  private readonly codeIndex = new Map<string, string>();
  private readonly socketToSession = new Map<string, { sessionId: string; role: 'stage' | 'mobile' }>();

  constructor(private readonly ttlMs: number = DEFAULT_PAIRING_TTL_MS) {}

  public createSession(stageSocketId: string, baseUrl = 'http://localhost:5173', now = Date.now()): SessionCreateAck {
    this.LeaveBySocket(stageSocketId, now);
    const sessionId = 'sess-' + randomBytes(12).toString('hex');
    const inviteToken = randomBytes(24).toString('hex'); // 192 bits >= 128 bits
    const stageToken = randomBytes(24).toString('hex');
    const mobileReconnectToken = randomBytes(24).toString('hex');
    const pairingCode = generatePinCode(new Set(this.codeIndex.keys()));
    const expiresAt = now + this.ttlMs;

    const session: ManagedSession = {
      sessionId,
      pairingCode,
      inviteToken,
      stageToken,
      mobileReconnectToken,
      publicBaseUrl: baseUrl.replace(/\/$/, ''),
      createdAt: now,
      expiresAt,
      updatedAt: now,
      phase: 'WAITING',
      stageSocketId,
      mobileSocketId: null,
      effectMode: 'NONE',
      quality: 'HIGH',
      mirrored: true,
    };

    this.sessions.set(sessionId, session);
    this.codeIndex.set(pairingCode, sessionId);
    this.socketToSession.set(stageSocketId, { sessionId, role: 'stage' });

    return {
      ok: true,
      session: this.toPublicInfo(session),
      qr: this.toQRData(session),
      stageToken,
    };
  }

  public regeneratePairingCode(sessionId: string, stageSocketId: string, now = Date.now()): SessionCreateAck {
    const session = this.sessions.get(sessionId);
    if (!session || session.stageSocketId !== stageSocketId) {
      return { ok: false, error: 'UNAUTHORIZED' };
    }
    this.codeIndex.delete(session.pairingCode);
    session.pairingCode = generatePinCode(new Set(this.codeIndex.keys()));
    session.inviteToken = randomBytes(24).toString('hex');
    session.expiresAt = now + this.ttlMs;
    session.updatedAt = now;
    if (!session.mobileSocketId) {
      session.phase = 'WAITING';
    }
    this.codeIndex.set(session.pairingCode, session.sessionId);

    return {
      ok: true,
      session: this.toPublicInfo(session),
      qr: this.toQRData(session),
    };
  }

  public joinSession(socketId: string, payload: SessionJoinPayload, now = Date.now()): SessionJoinAck {
    const rawCode = payload.pairingCode?.trim() || '';
    const targetId = payload.sessionId?.trim() || (rawCode ? this.codeIndex.get(rawCode) : undefined);

    if (!targetId) {
      return {
        ok: false,
        error: 'INVALID_CODE',
        message: 'Código de pareamento ou sessão inválido.',
      };
    }

    const session = this.sessions.get(targetId);
    if (!session || session.phase === 'CLOSED') {
      return {
        ok: false,
        error: 'SESSION_NOT_FOUND',
        message: 'Sessão inexistente ou encerrada.',
      };
    }

    if (payload.role === 'stage') {
      if (payload.reconnectToken && safeCompare(payload.reconnectToken, session.stageToken)) {
        session.stageSocketId = socketId;
        session.updatedAt = now;
        this.socketToSession.set(socketId, { sessionId: session.sessionId, role: 'stage' });
        return {
          ok: true,
          session: this.toPublicInfo(session),
          reconnectToken: session.stageToken,
        };
      }
      return {
        ok: false,
        error: 'UNAUTHORIZED',
        message: 'Apenas o palco criador pode assumir o papel stage.',
      };
    }

    // Mobile role join / reconnect
    const isReconnect = Boolean(
      payload.reconnectToken && safeCompare(payload.reconnectToken, session.mobileReconnectToken),
    );

    if (!isReconnect) {
      if (now > session.expiresAt) {
        return {
          ok: false,
          error: 'SESSION_EXPIRED',
          message: 'O convite de pareamento expirou. Gere um novo QR Code no palco.',
        };
      }
      const codeValid = rawCode.length === 6 && safeCompare(rawCode, session.pairingCode);
      const tokenValid = Boolean(payload.inviteToken && safeCompare(payload.inviteToken, session.inviteToken));
      if (!codeValid && !tokenValid) {
        // RF-06: Reject invalid attempts without kicking the active mobile!
        return {
          ok: false,
          error: 'INVALID_CODE',
          message: 'Credenciais de pareamento inválidas.',
        };
      }
      if (session.mobileSocketId !== null && session.mobileSocketId !== socketId) {
        // RF-06: Only 1 active mobile controller allowed; do not expel active mobile
        return {
          ok: false,
          error: 'MOBILE_ALREADY_ACTIVE',
          message: 'Já existe um celular conectado e ativo nesta sessão.',
        };
      }
    }

    if (session.mobileSocketId && session.mobileSocketId !== socketId) {
      this.socketToSession.delete(session.mobileSocketId);
    }

    session.mobileSocketId = socketId;
    session.phase = 'PAIRED';
    session.updatedAt = now;
    this.socketToSession.set(socketId, { sessionId: session.sessionId, role: 'mobile' });

    return {
      ok: true,
      session: this.toPublicInfo(session),
      reconnectToken: session.mobileReconnectToken,
    };
  }

  public updatePhase(sessionId: string, phase: SessionPhase, now = Date.now()): SessionInfoPayload | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    session.phase = phase;
    session.updatedAt = now;
    return this.toPublicInfo(session);
  }

  public applyControlCommand(
    socketId: string,
    sessionId: string,
    update: { effectMode?: EffectMode; quality?: RenderQuality; mirrored?: boolean },
    now = Date.now(),
  ): SessionInfoPayload | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (socketId !== session.mobileSocketId && socketId !== session.stageSocketId) {
      return null;
    }
    if (update.effectMode) session.effectMode = update.effectMode;
    if (update.quality) session.quality = update.quality;
    if (typeof update.mirrored === 'boolean') session.mirrored = update.mirrored;
    session.updatedAt = now;
    return this.toPublicInfo(session);
  }

  public verifyPeerMembership(socketId: string, sessionId: string): ManagedSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (session.stageSocketId !== socketId && session.mobileSocketId !== socketId) {
      return null;
    }
    return session;
  }

  public LeaveBySocket(socketId: string, now = Date.now()): ManagedSession | null {
    const binding = this.socketToSession.get(socketId);
    if (!binding) return null;
    this.socketToSession.delete(socketId);
    const session = this.sessions.get(binding.sessionId);
    if (!session) return null;

    if (binding.role === 'mobile' && session.mobileSocketId === socketId) {
      session.mobileSocketId = null;
      if (session.phase !== 'CLOSED') {
        session.phase = 'INTERRUPTED';
      }
      session.updatedAt = now;
      return session;
    }

    if (binding.role === 'stage' && session.stageSocketId === socketId) {
      session.stageSocketId = null;
      session.phase = 'CLOSED';
      session.updatedAt = now;
      this.codeIndex.delete(session.pairingCode);
      return session;
    }

    return null;
  }

  public getSession(sessionId: string): ManagedSession | null {
    return this.sessions.get(sessionId) ?? null;
  }

  public toQRData(session: ManagedSession): PairingQRData {
    const joinUrl = `${session.publicBaseUrl}/control?session=${encodeURIComponent(session.sessionId)}&code=${encodeURIComponent(session.pairingCode)}&token=${encodeURIComponent(session.inviteToken)}`;
    return {
      sessionId: session.sessionId,
      pairingCode: session.pairingCode,
      inviteToken: session.inviteToken,
      joinUrl,
      expiresAt: new Date(session.expiresAt).toISOString(),
      ttlMs: Math.max(0, session.expiresAt - Date.now()),
    };
  }

  public toPublicInfo(session: ManagedSession): SessionInfoPayload {
    const joinUrl = `${session.publicBaseUrl}/control?session=${encodeURIComponent(session.sessionId)}&code=${encodeURIComponent(session.pairingCode)}&token=${encodeURIComponent(session.inviteToken)}`;
    return {
      sessionId: session.sessionId,
      phase: session.phase,
      pairingCode: session.pairingCode,
      joinUrl,
      expiresAt: new Date(session.expiresAt).toISOString(),
      mobileConnected: session.mobileSocketId !== null,
      stageConnected: session.stageSocketId !== null,
      effectMode: session.effectMode,
      quality: session.quality,
      mirrored: session.mirrored,
      updatedAt: new Date(session.updatedAt).toISOString(),
    };
  }
}
