import type { RtcSignalPayload, SessionRole } from '../../shared/contracts/system-events';

export type RtcPeerLifecycleState =
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed';

export interface PeerSignalingBridge {
  emitOffer: (payload: RtcSignalPayload) => void;
  emitAnswer: (payload: RtcSignalPayload) => void;
  emitIceCandidate: (payload: RtcSignalPayload) => void;
}

export interface PeerLike {
  connectionState: RtcPeerLifecycleState;
  iceConnectionState: string;
  remoteDescription: { type: 'offer' | 'answer'; sdp: string } | null;
  localDescription: { type: 'offer' | 'answer'; sdp: string } | null;
  onicecandidate: ((event: { candidate: RtcSignalPayload['candidate'] | null }) => void) | null;
  ontrack: ((event: { streams: MediaStream[]; track: MediaStreamTrack }) => void) | null;
  onconnectionstatechange: (() => void) | null;
  oniceconnectionstatechange: (() => void) | null;
  addTrack: (track: MediaStreamTrack, stream: MediaStream) => { replaceTrack?: (next: MediaStreamTrack | null) => Promise<void> };
  createOffer: (options?: { iceRestart?: boolean }) => Promise<{ type: 'offer'; sdp: string }>;
  createAnswer: () => Promise<{ type: 'answer'; sdp: string }>;
  setLocalDescription: (desc: { type: 'offer' | 'answer'; sdp: string }) => Promise<void>;
  setRemoteDescription: (desc: { type: 'offer' | 'answer'; sdp: string }) => Promise<void>;
  addIceCandidate: (candidate: NonNullable<RtcSignalPayload['candidate']>) => Promise<void>;
  close: () => void;
}

export interface WebRtcPeerControllerOptions {
  sessionId: string;
  role: SessionRole;
  signaling: PeerSignalingBridge;
  iceServers?: RTCIceServer[];
  createPeerConnection?: (config: RTCConfiguration) => PeerLike;
  onStateChange?: (state: RtcPeerLifecycleState, iceState: string) => void;
  onRemoteStream?: (stream: MediaStream) => void;
}

export class WebRtcPeerController {
  private peer: PeerLike | null = null;
  private state: RtcPeerLifecycleState = 'new';
  private iceState = 'new';
  private pendingCandidates: NonNullable<RtcSignalPayload['candidate']>[] = [];
  private remoteDescSet = false;
  private videoSender: { replaceTrack?: (next: MediaStreamTrack | null) => Promise<void> } | null = null;
  private localStream: MediaStream | null = null;
  private reconnectAttempts = 0;
  private disposed = false;

  constructor(private readonly options: WebRtcPeerControllerOptions) {}

  public getState(): RtcPeerLifecycleState {
    return this.state;
  }

  public getIceState(): string {
    return this.iceState;
  }

  public getPendingCandidateCount(): number {
    return this.pendingCandidates.length;
  }

  public getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  private ensurePeer(): PeerLike {
    if (this.disposed) {
      throw new Error('WebRtcPeerController já foi descartado');
    }
    if (this.peer) return this.peer;

    const config: RTCConfiguration = {
      iceServers: this.options.iceServers ?? [{ urls: 'stun:stun.l.google.com:19302' }],
    };

    const peer = this.options.createPeerConnection
      ? this.options.createPeerConnection(config)
      : (new RTCPeerConnection(config) as unknown as PeerLike);

    this.remoteDescSet = false;
    this.pendingCandidates = [];

    peer.onicecandidate = (event) => {
      if (this.disposed || !event.candidate) return;
      this.options.signaling.emitIceCandidate({
        sessionId: this.options.sessionId,
        candidate: {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid ?? null,
          sdpMLineIndex: event.candidate.sdpMLineIndex ?? null,
          usernameFragment: event.candidate.usernameFragment ?? null,
        },
      });
    };

    peer.ontrack = (event) => {
      if (this.disposed) return;
      const stream = event.streams?.[0];
      if (stream && this.options.onRemoteStream) {
        this.options.onRemoteStream(stream);
      }
    };

    const syncState = () => {
      if (this.disposed) return;
      this.state = peer.connectionState || 'new';
      this.iceState = peer.iceConnectionState || 'new';
      if (this.state === 'connected') {
        this.reconnectAttempts = 0;
      }
      this.options.onStateChange?.(this.state, this.iceState);
    };

    peer.onconnectionstatechange = syncState;
    peer.oniceconnectionstatechange = syncState;

    this.peer = peer;
    return peer;
  }

  public attachLocalStream(stream: MediaStream): void {
    const peer = this.ensurePeer();
    this.localStream = stream;
    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length > 0) {
      this.videoSender = peer.addTrack(videoTracks[0], stream);
    }
  }

  public async replaceVideoTrack(newStream: MediaStream): Promise<void> {
    this.localStream = newStream;
    const track = newStream.getVideoTracks()[0] ?? null;
    if (this.videoSender && typeof this.videoSender.replaceTrack === 'function') {
      await this.videoSender.replaceTrack(track);
    } else if (track) {
      const peer = this.ensurePeer();
      this.videoSender = peer.addTrack(track, newStream);
    }
  }

  public async startOffer(options: { iceRestart?: boolean } = {}): Promise<void> {
    if (this.options.role !== 'mobile') {
      throw new Error('Apenas o papel mobile inicia oferta de vídeo WebRTC');
    }
    const peer = this.ensurePeer();
    this.state = 'connecting';
    this.options.onStateChange?.(this.state, this.iceState);

    const offer = await peer.createOffer(options);
    await peer.setLocalDescription(offer);
    this.options.signaling.emitOffer({
      sessionId: this.options.sessionId,
      sdp: offer,
    });
  }

  public async handleRemoteOffer(payload: RtcSignalPayload): Promise<void> {
    if (!payload.sdp || payload.sdp.type !== 'offer') return;
    const peer = this.ensurePeer();
    this.state = 'connecting';
    this.options.onStateChange?.(this.state, this.iceState);

    await peer.setRemoteDescription(payload.sdp);
    this.remoteDescSet = true;
    await this.flushQueuedCandidates(peer);

    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    this.options.signaling.emitAnswer({
      sessionId: this.options.sessionId,
      sdp: answer,
    });
  }

  public async handleRemoteAnswer(payload: RtcSignalPayload): Promise<void> {
    if (!payload.sdp || payload.sdp.type !== 'answer') return;
    const peer = this.ensurePeer();
    await peer.setRemoteDescription(payload.sdp);
    this.remoteDescSet = true;
    await this.flushQueuedCandidates(peer);
  }

  public async handleRemoteIceCandidate(payload: RtcSignalPayload): Promise<void> {
    if (!payload.candidate || !payload.candidate.candidate) return;
    const peer = this.ensurePeer();
    if (!this.remoteDescSet || !peer.remoteDescription) {
      this.pendingCandidates.push(payload.candidate);
      return;
    }
    await peer.addIceCandidate(payload.candidate);
  }

  private async flushQueuedCandidates(peer: PeerLike): Promise<void> {
    const queued = this.pendingCandidates.splice(0, this.pendingCandidates.length);
    for (const candidate of queued) {
      await peer.addIceCandidate(candidate);
    }
  }

  public async reconnectWebRTC(reason: string): Promise<void> {
    void reason;
    if (this.disposed) return;
    this.reconnectAttempts += 1;
    if (this.options.role === 'mobile') {
      if (this.peer && this.peer.connectionState !== 'closed') {
        await this.startOffer({ iceRestart: true });
      } else {
        this.peer = null;
        if (this.localStream) {
          this.attachLocalStream(this.localStream);
        }
        await this.startOffer({ iceRestart: true });
      }
    }
  }

  public dispose(): void {
    this.disposed = true;
    this.pendingCandidates = [];
    this.remoteDescSet = false;
    this.videoSender = null;
    if (this.peer) {
      this.peer.onicecandidate = null;
      this.peer.ontrack = null;
      this.peer.onconnectionstatechange = null;
      this.peer.oniceconnectionstatechange = null;
      try {
        this.peer.close();
      } catch {
        // Ignore close errors
      }
      this.peer = null;
    }
    this.state = 'closed';
  }
}
