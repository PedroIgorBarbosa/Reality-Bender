import { describe, expect, it } from 'vitest';
import { SessionManager } from '../../src/server/realtime/session-manager';
import { generatePairingQrSvg, isValidPinCode, parsePairingQuery } from '../../src/shared/pairing/qr-matrix';

describe('SessionManager & QR Pairing (Issue #2)', () => {
  it('cria sessão com PIN de 6 dígitos, token >= 128 bits e gera QR SVG válido', () => {
    const manager = new SessionManager(300_000);
    const created = manager.createSession('stage-socket-1', 'https://stage.local', 1000);

    expect(created.ok).toBe(true);
    expect(created.session).toBeDefined();
    expect(created.qr).toBeDefined();
    expect(isValidPinCode(created.qr!.pairingCode)).toBe(true);
    // 24 bytes in hex = 48 chars = 192 bits >= 128 bits
    expect(created.qr!.inviteToken.length).toBeGreaterThanOrEqual(32);

    const parsed = parsePairingQuery(new URL(created.qr!.joinUrl).search);
    expect(parsed.sessionId).toBe(created.session!.sessionId);
    expect(parsed.code).toBe(created.qr!.pairingCode);
    expect(parsed.token).toBe(created.qr!.inviteToken);

    const svg = generatePairingQrSvg(created.qr!.joinUrl, created.qr!.pairingCode);
    expect(svg).toContain('<svg');
    expect(svg).toContain(created.qr!.pairingCode);
  });

  it('permite pareamento de 1 celular e rejeita intruso sem expulsar o celular ativo (RF-06)', () => {
    const manager = new SessionManager(300_000);
    const created = manager.createSession('stage-1', 'https://stage.local', 1000);
    const pin = created.qr!.pairingCode;
    const sessionId = created.session!.sessionId;

    // Invalid PIN attempt before any mobile connects
    const badAttempt = manager.joinSession('intruder-0', { sessionId, pairingCode: '000000', role: 'mobile' }, 2000);
    expect(badAttempt.ok).toBe(false);

    // Valid mobile joins
    const mobile1 = manager.joinSession('mobile-1', { sessionId, pairingCode: pin, role: 'mobile' }, 3000);
    expect(mobile1.ok).toBe(true);
    expect(mobile1.session?.phase).toBe('PAIRED');
    expect(mobile1.session?.mobileConnected).toBe(true);
    expect(mobile1.reconnectToken).toBeDefined();

    // Second mobile tries to join with the same valid PIN -> must be rejected with MOBILE_ALREADY_ACTIVE
    const intruder = manager.joinSession('mobile-2', { sessionId, pairingCode: pin, role: 'mobile' }, 4000);
    expect(intruder.ok).toBe(false);
    expect(intruder.error).toBe('MOBILE_ALREADY_ACTIVE');

    // Original mobile-1 remains active and connected
    const current = manager.getSession(sessionId);
    expect(current?.mobileSocketId).toBe('mobile-1');
    expect(current?.phase).toBe('PAIRED');

    // Reconnect using reconnectToken works even after socket ID changes
    const reconnected = manager.joinSession(
      'mobile-1-new-socket',
      { sessionId, reconnectToken: mobile1.reconnectToken, role: 'mobile' },
      5000,
    );
    expect(reconnected.ok).toBe(true);
    expect(manager.getSession(sessionId)?.mobileSocketId).toBe('mobile-1-new-socket');
  });

  it('expira convites após o TTL de 5 minutos (S-04)', () => {
    const manager = new SessionManager(300_000);
    const created = manager.createSession('stage-1', 'https://stage.local', 1000);
    const expiredJoin = manager.joinSession(
      'mobile-late',
      {
        sessionId: created.session!.sessionId,
        pairingCode: created.qr!.pairingCode,
        role: 'mobile',
      },
      1000 + 300_001,
    );
    expect(expiredJoin.ok).toBe(false);
    expect(expiredJoin.error).toBe('SESSION_EXPIRED');
  });
});
