import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  ControlCommandPayload,
  EffectMode,
  PairingQRData,
  RenderQuality,
  RtcSignalPayload,
  SessionInfoPayload,
} from '../../shared/contracts/system-events';
import {
   criarAmostraDiagnostico,
  verificarDisponibilidadeDeVideo,
  type DiagnosticSample,
} from '../../shared/diagnostics/metrics';
import {
  KEYBOARD_EFFECT_SHORTCUTS,
  computeContentRect,
  type GeometryConfig,
} from '../../shared/geometry/projection-geometry';
import { generatePairingQrSvg } from '../../shared/pairing/qr-matrix';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { DiagnosticsHud } from '../components/DiagnosticsHud';
import { createDimensionalPortalPlugin } from '../effects/dimensional-portal';
import { StageEffectsOrchestrator } from '../effects/effect-plugin';
import { createElectricAuraPlugin } from '../effects/electric-aura';
import { createEnergySpherePlugin } from '../effects/energy-sphere';
import { useSystemConnection } from '../hooks/use-system-connection';
import { WebRtcPeerController } from '../realtime/webrtc-peer';
import { iniciarMediaPipeHands, type HandsDetector } from '../tracking/mediapipe-tracker';

export function StagePage() {
  const { state, socket, signalingRttMs, reconnect } = useSystemConnection();
  const [session, setSession] = useState<SessionInfoPayload | null>(null);
  const [qrData, setQrData] = useState<PairingQRData | null>(null);
  const [effectMode, setEffectMode] = useState<EffectMode>('NONE');
  const [quality, setQuality] = useState<RenderQuality>('HIGH');
  const [mirrored, setMirrored] = useState<boolean>(true);
  const [hudVisible, setHudVisible] = useState<boolean>(true);
  const [rtcState, setRtcState] = useState<string>('new');
  const [iceState, setIceState] = useState<string>('new');
  const [trackingState, setTrackingState] = useState<string>('UNINITIALIZED');
  const [hasLiveVideo, setHasLiveVideo] = useState<boolean>(false);
  const [videoFrozen, setVideoFrozen] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const peerRef = useRef<WebRtcPeerController | null>(null);
  const detectorRef = useRef<HandsDetector | null>(null);
  const orchestratorRef = useRef<StageEffectsOrchestrator | null>(null);

  const rafTimestampsRef = useRef<number[]>([]);
  const videoFrameTimestampsRef = useRef<number[]>([]);
  const inferenceSamplesRef = useRef<number[]>([]);
  const lastVideoFrameMsRef = useRef<number | null>(null);

  const createOrRefreshSession = useCallback(() => {
    if (!socket || state.phase !== 'ONLINE') return;
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
    socket.emit(
      'session:create',
      { publicBaseUrl: baseUrl },
      (ack) => {
        if (ack.ok && ack.session && ack.qr) {
          setSession(ack.session);
          setQrData(ack.qr);
        }
      },
    );
  }, [socket, state.phase]);

  useEffect(() => {
    if (!socket) return;

    const onSessionState = (updated: SessionInfoPayload) => {
      setSession(updated);
      setEffectMode(updated.effectMode);
      setQuality(updated.quality);
      setMirrored(updated.mirrored);
      orchestratorRef.current?.setMode(updated.effectMode, updated.quality);
    };

    const onControlCommand = (cmd: ControlCommandPayload) => {
      if (cmd.effectMode) setEffectMode(cmd.effectMode);
      if (cmd.quality) setQuality(cmd.quality);
      if (typeof cmd.mirrored === 'boolean') setMirrored(cmd.mirrored);
      if (cmd.type === 'CALIBRATE') {
        const snap = detectorRef.current?.triggerCalibration();
        if (snap) setTrackingState(snap.phase);
      }
      if (cmd.type === 'STOP_SESSION') {
        peerRef.current?.dispose();
        peerRef.current = null;
        setHasLiveVideo(false);
      }
    };

    const ensureStagePeer = (sessionId: string): WebRtcPeerController => {
      if (peerRef.current) return peerRef.current;
      const controller = new WebRtcPeerController({
        sessionId,
        role: 'stage',
        signaling: {
          emitOffer: (p) => socket.emit('rtc:offer', p),
          emitAnswer: (p) => socket.emit('rtc:answer', p),
          emitIceCandidate: (p) => socket.emit('rtc:ice', p),
        },
        onStateChange: (nextRtc, nextIce) => {
          setRtcState(nextRtc);
          setIceState(nextIce);
          if (nextRtc === 'connected') {
            setHasLiveVideo(true);
          } else if (nextRtc === 'disconnected' || nextRtc === 'failed' || nextRtc === 'closed') {
            setHasLiveVideo(false);
          }
        },
        onRemoteStream: (stream) => {
          setHasLiveVideo(true);
          lastVideoFrameMsRef.current = Date.now();
          videoFrameTimestampsRef.current.push(Date.now());
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        },
      });
      peerRef.current = controller;
      return controller;
    };

    const onOffer = (payload: RtcSignalPayload) => {
      const peer = ensureStagePeer(payload.sessionId);
      void peer.handleRemoteOffer(payload);
    };

    const onIce = (payload: RtcSignalPayload) => {
      const peer = ensureStagePeer(payload.sessionId);
      void peer.handleRemoteIceCandidate(payload);
    };

    socket.on('session:state', onSessionState);
    socket.on('session:joined', onSessionState);
    socket.on('control:command', onControlCommand);
    socket.on('rtc:offer', onOffer);
    socket.on('rtc:ice', onIce);

    return () => {
      socket.off('session:state', onSessionState);
      socket.off('session:joined', onSessionState);
      socket.off('control:command', onControlCommand);
      socket.off('rtc:offer', onOffer);
      socket.off('rtc:ice', onIce);
    };
  }, [socket]);

  useEffect(() => {
    let active = true;
    const orchestrator = new StageEffectsOrchestrator(canvasRef.current ?? undefined);
    orchestrator.registerPlugin(createEnergySpherePlugin());
    orchestrator.registerPlugin(createDimensionalPortalPlugin());
    orchestrator.registerPlugin(createElectricAuraPlugin());
    orchestratorRef.current = orchestrator;

    void iniciarMediaPipeHands().then((det) => {
      if (!active) {
        det.dispose();
        return;
      }
      detectorRef.current = det;
    });

    return () => {
      active = false;
      detectorRef.current?.dispose();
      detectorRef.current = null;
      orchestrator.dispose();
      orchestratorRef.current = null;
      peerRef.current?.dispose();
      peerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key;
      if (key in KEYBOARD_EFFECT_SHORTCUTS) {
        const nextEffect = KEYBOARD_EFFECT_SHORTCUTS[key];
        setEffectMode(nextEffect);
        orchestratorRef.current?.setMode(nextEffect, quality);
        return;
      }
      if (key.toLowerCase() === 'f') {
        if (typeof document !== 'undefined' && document.documentElement?.requestFullscreen) {
          if (!document.fullscreenElement) {
            void document.documentElement.requestFullscreen();
          } else {
            void document.exitFullscreen?.();
          }
        }
      } else if (key.toLowerCase() === 'm') {
        setMirrored((prev) => !prev);
      } else if (key.toLowerCase() === 'd') {
        setHudVisible((prev) => !prev);
      } else if (key.toLowerCase() === 'q') {
        setQuality((prev) => (prev === 'HIGH' ? 'MEDIUM' : prev === 'MEDIUM' ? 'COMPAT' : 'HIGH'));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [quality]);

  useEffect(() => {
    if (!hasLiveVideo) {
      setVideoFrozen(false);
      return;
    }
    const timer = setInterval(() => {
      const check = verificarDisponibilidadeDeVideo(lastVideoFrameMsRef.current, Date.now());
      setVideoFrozen(check.frozen);
    }, 1000);
    return () => clearInterval(timer);
  }, [hasLiveVideo]);

  const disconnected = state.phase === 'ERROR' || state.phase === 'OFFLINE';
  const geometryConfig: GeometryConfig = {
    fit: 'contain',
    mirrored,
    orientationFromDecodedVideo: 'native',
  };
  const stageRect = computeContentRect(
    { widthPx: 1280, heightPx: 720 },
    { cssWidth: 1280, cssHeight: 720, dpr: 1 },
    geometryConfig,
  );

  const diagnosticSample: DiagnosticSample = criarAmostraDiagnostico({
    timestamp: Date.now(),
    rafTimestamps: rafTimestampsRef.current,
    videoFrameTimestamps: videoFrameTimestampsRef.current,
    inferenceSamplesMs: inferenceSamplesRef.current,
    videoDimensions: hasLiveVideo ? { width: 1280, height: 720 } : null,
    rtcConnectionState: rtcState,
    iceConnectionState: iceState,
    trackingState,
    effectMode,
    quality,
    signalingRttMs,
  });

  const qrSvg = qrData ? generatePairingQrSvg(qrData.joinUrl, qrData.pairingCode) : null;

  return (
    <main className="stage-page" data-effect-mode={effectMode} data-quality={quality}>
      <header className="page-header">
        <div className="brand">
          <span className="brand-logo" aria-hidden="true">❖</span>
          <span className="brand-name">REALITY BENDER</span>
          <span className="brand-tag">STAGE / PALCO</span>
        </div>
        <div className="header-actions">
          <button type="button" className="ghost-btn" onClick={() => setHudVisible((v) => !v)}>
            {hudVisible ? 'Ocultar HUD (D)' : 'Exibir HUD (D)'}
          </button>
          <Link className="text-link" to="/control">Abrir Controle Móvel (/control)</Link>
        </div>
      </header>

      <div className="stage-layout">
        <div className="stage-heading">
          <p className="eyebrow">PROJEÇÃO INTERATIVA · WEBRTC + MEDIAPIPE + THREE.JS</p>
          <h1>Tela de apresentação ao vivo</h1>
          <p>
            Pareie o celular via QR Code ou PIN de 6 dígitos para transmitir a câmera em tempo real e controlar Esfera de Energia (1), Portal Dimensional (2) e Aura Elétrica (3).
          </p>
        </div>

        <section
          className="projection-panel"
          aria-label="Área de projeção ao vivo e efeitos 3D"
          data-mirrored={String(mirrored)}
          data-scale={stageRect.scale.toFixed(2)}
        >
          <video
            ref={videoRef}
            className={'stage-video' + (mirrored ? ' stage-video--mirrored' : '')}
            autoPlay
            playsInline
            muted
            data-live={String(hasLiveVideo)}
          />
          <canvas
            ref={canvasRef}
            className="stage-webgl-canvas"
            width={1280}
            height={720}
            aria-label="Camada WebGL de efeitos 3D"
          />

          {!hasLiveVideo && (
            <div className="projection-content">
              <span className="empty-icon" aria-hidden="true">◇</span>
              <p className="eyebrow">
                {session?.mobileConnected ? 'CELULAR PAREADO · AGUARDANDO CÂMERA' : 'AGUARDANDO EMISSOR MÓVEL'}
              </p>
              <h2>
                {session?.mobileConnected
                  ? 'Toque em "Iniciar Câmera" no celular para iniciar o vídeo WebRTC'
                  : 'Vídeo ao vivo aguardando conexão WebRTC'}
              </h2>
              <p>
                Nenhuma mídia pré-gravada ou simulação é exibida. O palco projeta exclusivamente o fluxo real da câmera do celular pareado.
              </p>
            </div>
          )}

          <span className="projection-label">
            {hasLiveVideo ? `AO VIVO · EFEITO: ${effectMode}` : 'SEM FONTE DE VÍDEO'}
          </span>

          <DiagnosticsHud sample={diagnosticSample} visible={hudVisible} videoFrozen={videoFrozen} />
        </section>

        <aside className="operations-panel">
          <div className="section-heading">
            <h2>Estado operacional</h2>
            <span>{session ? session.phase : 'SEM SESSÃO'}</span>
          </div>

          <ConnectionStatus state={state} />

          {disconnected && (
            <div className="recovery">
              <p>Verifique se o servidor está ativo e se esta origem está autorizada.</p>
              <button type="button" onClick={reconnect}>Reconectar servidor</button>
            </div>
          )}

          <div className="pairing-box">
            <button
              type="button"
              className="primary-btn"
              disabled={state.phase !== 'ONLINE'}
              onClick={createOrRefreshSession}
            >
              {session ? 'Gerar novo QR / PIN' : 'Criar sessão / QR Code'}
            </button>

            {qrData && (
              <div className="qr-card" data-testid="qr-card">
                <div
                  className="qr-svg-wrapper"
                  dangerouslySetInnerHTML={{ __html: qrSvg ?? '' }}
                />
                <div className="qr-meta">
                  <span className="eyebrow">PIN DE PAREAMENTO (6 DÍGITOS)</span>
                  <strong className="pin-display" data-testid="pairing-pin">{qrData.pairingCode}</strong>
                  <small>Link direto: <a href={qrData.joinUrl}>{qrData.joinUrl}</a></small>
                </div>
              </div>
            )}
          </div>

          <dl className="system-facts">
            <div>
              <dt>Sessão de apresentação</dt>
              <dd>{session ? `${session.sessionId} (${session.phase})` : 'Aguardando criação'}</dd>
            </div>
            <div>
              <dt>Celular pareado</dt>
              <dd>{session?.mobileConnected ? 'Conectado e autenticado' : 'Aguardando celular'}</dd>
            </div>
            <div>
              <dt>Vídeo ao vivo WebRTC</dt>
              <dd>{hasLiveVideo ? 'Ativo (P2P conectado)' : `Inativo (${rtcState})`}</dd>
            </div>
          </dl>

          <div className="section-heading section-heading--controls">
            <h2>Controles de palco (Atalhos 0–3, M, Q, F)</h2>
          </div>
          <div className="effect-controls">
            {(['NONE', 'ENERGY', 'PORTAL', 'AURA'] as const).map((mode, idx) => (
              <button
                key={mode}
                type="button"
                className={effectMode === mode ? 'effect-btn effect-btn--active' : 'effect-btn'}
                onClick={() => {
                  setEffectMode(mode);
                  orchestratorRef.current?.setMode(mode, quality);
                }}
              >
                [{idx}] {mode}
              </button>
            ))}
          </div>
          <div className="secondary-controls">
            <button type="button" onClick={() => setMirrored((m) => !m)}>
              Espelhar (M): {mirrored ? 'SIM' : 'NÃO'}
            </button>
            <button
              type="button"
              onClick={() =>
                setQuality((q) => (q === 'HIGH' ? 'MEDIUM' : q === 'MEDIUM' ? 'COMPAT' : 'HIGH'))
              }
            >
              Qualidade (Q): {quality}
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}
