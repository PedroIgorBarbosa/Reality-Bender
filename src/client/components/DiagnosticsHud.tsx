import type { DiagnosticSample } from '../../shared/diagnostics/metrics';

export function DiagnosticsHud({
  sample,
  visible,
  videoFrozen,
}: {
  sample: DiagnosticSample;
  visible: boolean;
  videoFrozen: boolean;
}) {
  if (!visible) return null;

  return (
    <section className="diagnostics-hud" aria-label="Diagnóstico técnico em tempo real" role="region">
      <div className="diagnostics-hud__header">
        <strong>HUD DE DIAGNÓSTICO</strong>
        <span className="diagnostics-hud__badge">{sample.quality}</span>
      </div>
      <dl className="diagnostics-hud__grid">
        <div>
          <dt>FPS Render</dt>
          <dd>{sample.renderFps !== null ? `${sample.renderFps} fps` : 'Aguardando'}</dd>
        </div>
        <div>
          <dt>FPS Vídeo Remoto</dt>
          <dd>{sample.videoFps !== null ? `${sample.videoFps} fps` : 'Sem quadros'}</dd>
        </div>
        <div>
          <dt>Inferência P50 / P95</dt>
          <dd>
            {sample.inferenceDurationMsP50 !== null
              ? `${sample.inferenceDurationMsP50}ms / ${sample.inferenceDurationMsP95}ms`
              : 'N/A'}
          </dd>
        </div>
        <div>
          <dt>RTT Sinalização</dt>
          <dd>{sample.signalingRttMs !== null ? `${sample.signalingRttMs}ms` : 'N/A'}</dd>
        </div>
        <div>
          <dt>Estado WebRTC / ICE</dt>
          <dd>{sample.rtcConnectionState} / {sample.iceConnectionState}</dd>
        </div>
        <div>
          <dt>Tracking / Calibração</dt>
          <dd>{sample.trackingState}</dd>
        </div>
        <div>
          <dt>Efeito Ativo</dt>
          <dd>{sample.effectMode}</dd>
        </div>
        <div>
          <dt>Latência Física (Mão-Projeção)</dt>
          <dd>{sample.physicalMotionToPhotonLatencyMs}</dd>
        </div>
      </dl>
      {videoFrozen && (
        <p className="diagnostics-hud__warning" role="alert">
          Congelamento de vídeo detectado (&gt;= 3s sem novos quadros).
        </p>
      )}
    </section>
  );
}
