import { describe, expect, it } from 'vitest';
import { WebRtcPeerController, type PeerLike } from '../../src/client/realtime/webrtc-peer';
import { CameraCaptureService } from '../../src/client/services/camera-capture';

function createFakePeer(): PeerLike & { addedCandidates: string[]; closed: boolean } {
  return {
    connectionState: 'new',
    iceConnectionState: 'new',
    remoteDescription: null,
    localDescription: null,
    onicecandidate: null,
    ontrack: null,
    onconnectionstatechange: null,
    oniceconnectionstatechange: null,
    addedCandidates: [],
    closed: false,
    addTrack() {
      return {
        async replaceTrack() {},
      };
    },
    async createOffer(options) {
      return { type: 'offer', sdp: options?.iceRestart ? 'v=0-ice-restart-offer' : 'v=0-initial-offer' };
    },
    async createAnswer() {
      return { type: 'answer', sdp: 'v=0-answer' };
    },
    async setLocalDescription(desc) {
      this.localDescription = desc;
    },
    async setRemoteDescription(desc) {
      this.remoteDescription = desc;
      this.connectionState = 'connected';
      this.iceConnectionState = 'connected';
      this.onconnectionstatechange?.();
    },
    async addIceCandidate(c) {
      this.addedCandidates.push(c.candidate);
    },
    close() {
      this.closed = true;
      this.connectionState = 'closed';
    },
  };
}

describe('CameraCaptureService & WebRtcPeerController (Issue #3)', () => {
  it('bloqueia getUserMedia em contexto inseguro (HTTP fora de localhost) e trata erros de permissão', async () => {
    const insecureCam = new CameraCaptureService({
      isSecureContext: false,
      hostname: '192.168.0.25',
    });
    await expect(insecureCam.requestCamera()).rejects.toThrow('HTTPS');

    const deniedCam = new CameraCaptureService({
      isSecureContext: true,
      hostname: 'stage.local',
      async getUserMedia() {
        const err = new Error('Denied');
        err.name = 'NotAllowedError';
        throw err;
      },
    });
    await expect(deniedCam.requestCamera()).rejects.toThrow('Permissão da câmera negada');
  });

  it('alterna câmera traseira/frontal, aplica fallback em OverconstrainedError e encerra tracks', async () => {
    let stopped = 0;
    let calls = 0;
    const cam = new CameraCaptureService({
      isSecureContext: true,
      hostname: 'localhost',
      async getUserMedia() {
        calls += 1;
        if (calls === 1) {
          const err = new Error('Too high res');
          err.name = 'OverconstrainedError';
          throw err;
        }
        return {
          getTracks: () => [{ stop: () => { stopped += 1; } } as unknown as MediaStreamTrack],
          getVideoTracks: () => [{ stop: () => { stopped += 1; } } as unknown as MediaStreamTrack],
        } as unknown as MediaStream;
      },
    });

    await cam.requestCamera({ facingMode: 'environment' });
    expect(cam.getFacingMode()).toBe('environment');

    await cam.switchCamera();
    expect(cam.getFacingMode()).toBe('user');
    expect(stopped).toBe(1);

    cam.stopCamera();
    expect(stopped).toBe(2);
    expect(cam.getStream()).toBeNull();
  });

  it('enfileira candidatos ICE antes de remoteDescription e executa reconexão ICE restart', async () => {
    const mobilePeer = createFakePeer();
    const stagePeer = createFakePeer();
    const offers: string[] = [];
    const answers: string[] = [];

    const stageCtrl = new WebRtcPeerController({
      sessionId: 'sess-rtc-1',
      role: 'stage',
      createPeerConnection: () => stagePeer,
      signaling: {
        emitOffer: () => {},
        emitAnswer: (p) => { if (p.sdp) answers.push(p.sdp.sdp); },
        emitIceCandidate: () => {},
      },
    });

    // Arrive before remote offer
    await stageCtrl.handleRemoteIceCandidate({
      sessionId: 'sess-rtc-1',
      candidate: { candidate: 'candidate:1 1 UDP 2122252543 192.168.1.2 5000 typ host' },
    });
    expect(stageCtrl.getPendingCandidateCount()).toBe(1);
    expect(stagePeer.addedCandidates).toHaveLength(0);

    // Remote offer arrives -> sets remoteDescription, flushes candidate queue, emits answer
    await stageCtrl.handleRemoteOffer({
      sessionId: 'sess-rtc-1',
      sdp: { type: 'offer', sdp: 'v=0-offer' },
    });
    expect(stageCtrl.getPendingCandidateCount()).toBe(0);
    expect(stagePeer.addedCandidates).toEqual(['candidate:1 1 UDP 2122252543 192.168.1.2 5000 typ host']);
    expect(answers).toEqual(['v=0-answer']);

    const mobileCtrl = new WebRtcPeerController({
      sessionId: 'sess-rtc-1',
      role: 'mobile',
      createPeerConnection: () => mobilePeer,
      signaling: {
        emitOffer: (p) => { if (p.sdp) offers.push(p.sdp.sdp); },
        emitAnswer: () => {},
        emitIceCandidate: () => {},
      },
    });

    await mobileCtrl.startOffer();
    expect(offers[0]).toBe('v=0-initial-offer');

    await mobileCtrl.reconnectWebRTC('network-drop');
    expect(offers[1]).toBe('v=0-ice-restart-offer');
    expect(mobileCtrl.getReconnectAttempts()).toBe(1);

    mobileCtrl.dispose();
    stageCtrl.dispose();
    expect(mobilePeer.closed).toBe(true);
    expect(stagePeer.closed).toBe(true);
  });
});
