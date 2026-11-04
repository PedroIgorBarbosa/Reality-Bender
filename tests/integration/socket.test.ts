import { io as ClientIO } from 'socket.io-client';
import { describe, expect, it } from 'vitest';
import { createHttpApplication } from '../../src/server/app';
import { parseServerConfig } from '../../src/server/config/env';
import { attachSystemSocket } from '../../src/server/realtime/system-socket';
import type { RtcSignalPayload, SessionCreateAck, SessionJoinAck } from '../../src/shared/contracts/system-events';

describe('Socket.IO End-to-End Signaling, Pairing, WebRTC Relay & Commands (Issues #1, #2, #3, #9)', () => {
  it('executa fluxo completo: handshake -> session:create -> session:join -> bloqueio de intruso -> rtc:offer/answer/ice -> control:command com ACK', async () => {
    const config = parseServerConfig({
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: '3000',
      CLIENT_ORIGINS: 'http://localhost:5173',
    });
    const { httpServer } = createHttpApplication(config);
    const io = attachSystemSocket(httpServer, config);

    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', () => resolve()));
    const address = httpServer.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const url = `http://127.0.0.1:${port}`;

    const makeClient = () =>
      ClientIO(url, {
        path: '/socket.io',
        autoConnect: false,
        reconnection: false,
        extraHeaders: { origin: 'http://localhost:5173' },
      } as Record<string, unknown>);

    const stageClient = makeClient();
    const mobileClient = makeClient();
    const intruderClient = makeClient();

    try {
      await Promise.all([
        new Promise<void>((res) => { stageClient.on('system:ready', () => res()); stageClient.connect(); }),
        new Promise<void>((res) => { mobileClient.on('system:ready', () => res()); mobileClient.connect(); }),
        new Promise<void>((res) => { intruderClient.on('system:ready', () => res()); intruderClient.connect(); }),
      ]);

      // 1. Stage creates session
      const createAck = await new Promise<SessionCreateAck>((res) => {
        stageClient.emit('session:create', { publicBaseUrl: 'http://localhost:5173' }, (ack: SessionCreateAck) => res(ack));
      });
      expect(createAck.ok).toBe(true);
      const sessionId = createAck.session!.sessionId;
      const pin = createAck.qr!.pairingCode;

      // 2. Mobile joins with valid PIN
      const joinAck = await new Promise<SessionJoinAck>((res) => {
        mobileClient.emit('session:join', { sessionId, pairingCode: pin, role: 'mobile' }, (ack: SessionJoinAck) => res(ack));
      });
      expect(joinAck.ok).toBe(true);
      expect(joinAck.session?.phase).toBe('PAIRED');

      // 3. Intruder tries to join same session -> rejected without disconnecting mobileClient
      const intruderAck = await new Promise<SessionJoinAck>((res) => {
        intruderClient.emit('session:join', { sessionId, pairingCode: pin, role: 'mobile' }, (ack: SessionJoinAck) => res(ack));
      });
      expect(intruderAck.ok).toBe(false);
      expect(intruderAck.error).toBe('MOBILE_ALREADY_ACTIVE');

      // 4. WebRTC signaling relay (offer from mobile -> stage, answer from stage -> mobile)
      const receivedOfferPromise = new Promise<RtcSignalPayload>((res) => {
        stageClient.on('rtc:offer', (payload: RtcSignalPayload) => res(payload));
      });
      mobileClient.emit('rtc:offer', {
        sessionId,
        sdp: { type: 'offer', sdp: 'v=0-live-camera-offer' },
      });
      const offerOnStage = await receivedOfferPromise;
      expect(offerOnStage.sdp?.sdp).toBe('v=0-live-camera-offer');

      const receivedAnswerPromise = new Promise<RtcSignalPayload>((res) => {
        mobileClient.on('rtc:answer', (payload: RtcSignalPayload) => res(payload));
      });
      stageClient.emit('rtc:answer', {
        sessionId,
        sdp: { type: 'answer', sdp: 'v=0-stage-answer' },
      });
      const answerOnMobile = await receivedAnswerPromise;
      expect(answerOnMobile.sdp?.sdp).toBe('v=0-stage-answer');

      // 5. Remote command from mobile -> stage with ACK confirmation
      const commandAck = await new Promise<{ ok: boolean; commandId: string; session?: { effectMode: string } }>((res) => {
        mobileClient.emit(
          'control:command',
          {
            sessionId,
            commandId: 'cmd-energy-1',
            type: 'SET_EFFECT',
            effectMode: 'ENERGY',
          },
          (ack: { ok: boolean; commandId: string; session?: { effectMode: string } }) => res(ack),
        );
      });
      expect(commandAck.ok).toBe(true);
      expect(commandAck.commandId).toBe('cmd-energy-1');
      expect(commandAck.session?.effectMode).toBe('ENERGY');
    } finally {
      stageClient.disconnect();
      mobileClient.disconnect();
      intruderClient.disconnect();
      await new Promise<void>((res) => io.close(() => res()));
      if (httpServer.listening) {
        await new Promise<void>((res) => httpServer.close(() => res()));
      }
    }
  });
});
