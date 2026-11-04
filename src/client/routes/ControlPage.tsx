import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  EffectMode,
  RenderQuality,
  RtcSignalPayload,
  SessionInfoPayload,
} from '../../shared/contracts/system-events';
import { isValidPinCode, parsePairingQuery } from '../../shared/pairing/qr-matrix';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { useSystemConnection } from '../hooks/use-system-connection';
import { WebRtcPeerController } from '../realtime/webrtc-peer';
import { CameraCaptureError, CameraCaptureService, type CameraFacingMode } from '../services/camera-capture';

export function ControlPage() {
  const { state, socket, reconnect } = useSystemConnection();

  const initialQuery = parsePairingQuery(
    typeof window !== 'undefined' && window.location ? window.location.search : '',
  );

  const [pinInput, setPinInput] = useState<string>(initialQuery.code);
  const [inviteToken] = useState<string>(initialQuery.token);
  const [sessionIdInput] = useState<string>(initialQuery.sessionId);
  const [reconnectToken, setReconnectToken] = useState<string>('');
  const [session, setSession] = useState<SessionInfoPayload | null>(null);
  const [pairingError, setPairingError] = useState<string | null>(null);

  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<CameraFacingMode>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [rtcState, setRtcState] = useState<string>('new');
  const [lastAckStatus, setLastAckStatus] = useState<string | null>(null);

  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraServiceRef = useRef<CameraCaptureService>(new CameraCaptureService());
  const peerRef = useRef<WebRtcPeerController | null>(null);

  useEffect(() => {
    if (!socket) return;

    const onSessionState = (updated: SessionInfoPayload) => {
      setSession(updated);
    };
    const onAnswer = (payload: RtcSignalPayload) => {
      void peerRef.current?.handleRemoteAnswer(payload);
    };
    const onIce = (payload: RtcSignalPayload) => {
      void peerRef.current?.handleRemoteIceCandidate(payload);
    };

    socket.on('session:state', onSessionState);
    socket.on('session:joined', onSessionState);
    socket.on('rtc:answer', onAnswer);
    socket.on('rtc:ice', onIce);

    return () => {
      socket.off('session:state', onSessionState);
      socket.off('session:joined', onSessionState);
      socket.off('rtc:answer', onAnswer);
      socket.off('rtc:ice', onIce);
    };
  }, [socket]);

  useEffect(() => {
    return () => {
      peerRef.current?.dispose();
      peerRef.current = null;
      cameraServiceRef.current.stopCamera();
    };
  }, []);

  const handleJoinSession = useCallback(() => {
    if (!socket || state.phase !== 'ONLINE') return;
    setPairingError(null);

    if (!reconnectToken && !inviteToken && !isValidPinCode(pinInput)) {
      setPairingError('Informe um PIN numérico válido de 6 dígitos.');
      return;
    }

    socket.emit(
      'session:join',
      {
        sessionId: sessionIdInput || undefined,
        pairingCode: pinInput.trim(),
        inviteToken: inviteToken || undefined,
        reconnectToken: reconnectToken || undefined,
        role: 'mobile',
      },
      (ack) => {
        if (!ack.ok || !ack.session) {
          setPairingError(ack.message ?? 'Não foi possível parear com o palco.');
          return;
        }
        setSession(ack.session);
        if (ack.reconnectToken) {
          setReconnectToken(ack.reconnectToken);
        }
      },
    );
  }, [inviteToken, pinInput, reconnectToken, sessionIdInput, socket, state.phase]);

  const handleStartCameraAndStream = useCallback(async () => {
    if (!socket || !session) return;
    setCameraError(null);
    try {
      const stream = await cameraServiceRef.current.requestCamera({ facingMode });
      setCameraActive(true);
      setFacingMode(cameraServiceRef.current.getFacingMode());
      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = stream;
      }

      peerRef.current?.dispose();
      const peer = new WebRtcPeerController({
        sessionId: session.sessionId,
        role: 'mobile',
        signaling: {
          emitOffer: (p) => socket.emit('rtc:offer', p),
          emitAnswer: (p) => socket.emit('rtc:answer', p),
          emitIceCandidate: (p) => socket.emit('rtc:ice', p),
        },
        onStateChange: (nextState) => {
          setRtcState(nextState);
        },
      });
      peerRef.current = peer;
      peer.attachLocalStream(stream);
      await peer.startOffer();
    } catch (err: unknown) {
      const mapped = err instanceof CameraCaptureError ? err.message : 'Erro ao iniciar câmera.';
      setCameraError(mapped);
      setCameraActive(false);
    }
  }, [facingMode, session, socket]);

  const handleSwitchCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const nextStream = await cameraServiceRef.current.switchCamera();
      setFacingMode(cameraServiceRef.current.getFacingMode());
      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = nextStream;
      }
      if (peerRef.current) {
        await peerRef.current.replaceVideoTrack(nextStream);
      }
    } catch (err: unknown) {
      const mapped = err instanceof CameraCaptureError ? err.message : 'Erro ao alternar câmera.';
      setCameraError(mapped);
    }
  }, []);

  const handleStopCamera = useCallback(() => {
    peerRef.current?.dispose();
    peerRef.current = null;
    cameraServiceRef.current.stopCamera();
    setCameraActive(false);
    setRtcState('closed');
  }, []);

  const sendCommand = useCallback(
    (
      type: 'SET_EFFECT' | 'SET_QUALITY' | 'TOGGLE_MIRROR' | 'CALIBRATE' | 'RECONNECT_RTC' | 'STOP_SESSION',
      extra: { effectMode?: EffectMode; quality?: RenderQuality; mirrored?: boolean } = {},
    ) => {
      if (!socket || !session) return;
      const commandId = 'cmd-' + Date.now();
      socket.emit(
        'control:command',
        {
          sessionId: session.sessionId,
          commandId,
          type,
          ...extra,
        },
        (ack) => {
          if (ack.ok) {
            setLastAckStatus(`Comando ${type} confirmado (${ack.commandId})`);
            if (ack.session) setSession(ack.session);
          } else {
            setLastAckStatus(`Falha no comando: ${ack.error ?? 'ERRO'}`);
          }
        },
      );
    },
    [session, socket],
  );

  const disconnected = state.phase === 'ERROR' || state.phase === 'OFFLINE';

  return (
    <main className="control-page">
      <header className="page-header">
        <div className="brand">
          <span className="brand-logo" aria-hidden="true">❖</span>
          <span className="brand-name">REALITY BENDER</span>
          <span className="brand-tag">CONTROL / CELULAR</span>
        </div>
        <div className="header-actions">
          <Link className="text-link" to="/stage">Voltar ao Palco (/stage)</Link>
        </div>
      </header>

      <div className="control-layout">
        <section className="control-card">
          <p className="eyebrow">EMISSOR DE CÂMERA E CONTROLE REMOTO</p>
          <h1>Controle móvel</h1>
          <ConnectionStatus state={state} />

          {disconnected && (
            <div className="recovery">
              <p>Sem comunicação com o servidor de sinalização.</p>
              <button type="button" onClick={reconnect}>Reconectar servidor</button>
            </div>
          )}

          {!session ? (
            <div className="pairing-form" aria-label="Formulário de pareamento">
              <h2>1. Parear com o Palco</h2>
              <label htmlFor="pin-input">PIN de 6 dígitos exibido no /stage</label>
              <input
                id="pin-input"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
              />
              <button
                type="button"
                className="primary-btn"
                disabled={state.phase !== 'ONLINE'}
                onClick={handleJoinSession}
              >
                Conectar à sessão
              </button>
              {pairingError && (
                <p className="error-banner" role="alert">{pairingError}</p>
              )}
            </div>
          ) : (
            <div className="active-session-controls">
              <div className="session-badge">
                <strong>Sessão Pareada: {session.sessionId}</strong>
                <span>Estado WebRTC: {rtcState}</span>
              </div>

              <h2>2. Câmera e Transmissão WebRTC</h2>
              <div className="camera-preview-box">
                <video
                  ref={previewVideoRef}
                  className="mobile-preview-video"
                  autoPlay
                  playsInline
                  muted
                />
              </div>

              <div className="camera-actions">
                {!cameraActive ? (
                  <button type="button" className="primary-btn" onClick={() => void handleStartCameraAndStream()}>
                    Iniciar Câmera e Transmitir (WebRTC)
                  </button>
                ) : (
                  <>
                    <button type="button" onClick={() => void handleSwitchCamera()}>
                      Alternar Câmera ({facingMode === 'environment' ? 'Traseira' : 'Frontal'})
                    </button>
                    <button type="button" onClick={() => void peerRef.current?.reconnectWebRTC('manual')}>
                      Renegociar WebRTC
                    </button>
                    <button type="button" className="danger-btn" onClick={handleStopCamera}>
                      Encerrar Câmera
                    </button>
                  </>
                )}
              </div>

              {cameraError && (
                <p className="error-banner" role="alert">{cameraError}</p>
              )}

              <h2>3. Comandos de Efeito 3D (com confirmação ACK)</h2>
              <div className="effect-controls">
                {(['NONE', 'ENERGY', 'PORTAL', 'AURA'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={session.effectMode === mode ? 'effect-btn effect-btn--active' : 'effect-btn'}
                    onClick={() => sendCommand('SET_EFFECT', { effectMode: mode })}
                  >
                    {mode}
                  </button>
                ))}
              </div>

              <div className="secondary-controls">
                <button
                  type="button"
                  onClick={() => sendCommand('TOGGLE_MIRROR', { mirrored: !session.mirrored })}
                >
                  Espelhamento: {session.mirrored ? 'ATIVO' : 'INATIVO'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    sendCommand('SET_QUALITY', {
                      quality:
                        session.quality === 'HIGH'
                          ? 'MEDIUM'
                          : session.quality === 'MEDIUM'
                            ? 'COMPAT'
                            : 'HIGH',
                    })
                  }
                >
                  Qualidade: {session.quality}
                </button>
                <button type="button" onClick={() => sendCommand('CALIBRATE')}>
                  Recalibrar Rastreamento
                </button>
              </div>

              {lastAckStatus && (
                <p className="ack-status" role="status">{lastAckStatus}</p>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
