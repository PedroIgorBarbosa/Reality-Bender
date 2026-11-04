import type { EffectMode, RenderQuality } from '../contracts/system-events';

export interface DiagnosticSample {
  timestamp: number;
  renderFps: number | null;
  videoFps: number | null;
  inferenceDurationMsP50: number | null;
  inferenceDurationMsP95: number | null;
  videoDimensions: { width: number; height: number } | null;
  rtcConnectionState: string;
  iceConnectionState: string;
  trackingState: string;
  effectMode: EffectMode;
  quality: RenderQuality;
  signalingRttMs: number | null;
  physicalMotionToPhotonLatencyMs: 'NOT_MEASURED';
}

export const VIDEO_FREEZE_THRESHOLD_MS = 3000;

export function medirRenderFPS(rafTimestamps: readonly number[]): number | null {
  if (!Array.isArray(rafTimestamps) || rafTimestamps.length < 2) {
    return null;
  }
  const first = rafTimestamps[0];
  const last = rafTimestamps[rafTimestamps.length - 1];
  const spanMs = last - first;
  if (spanMs <= 0) return null;
  const intervals = rafTimestamps.length - 1;
  return Math.round(((intervals * 1000) / spanMs) * 10) / 10;
}

export function medirVideoFPS(frameCallbacks: readonly number[]): number | null {
  return medirRenderFPS(frameCallbacks);
}

export function medirInferencia(amostras: readonly number[]): { p50: number | null; p95: number | null } {
  const valid = amostras.filter((n) => Number.isFinite(n) && n >= 0).sort((a, b) => a - b);
  if (valid.length === 0) {
    return { p50: null, p95: null };
  }
  const percentile = (p: number): number => {
    const idx = Math.min(valid.length - 1, Math.max(0, Math.ceil((p / 100) * valid.length) - 1));
    return Math.round(valid[idx] * 100) / 100;
  };
  return {
    p50: percentile(50),
    p95: percentile(95),
  };
}

export function verificarDisponibilidadeDeVideo(
  lastFrameTimestampMs: number | null,
  nowMs: number,
  freezeThresholdMs: number = VIDEO_FREEZE_THRESHOLD_MS,
): { frozen: boolean; silenceDurationMs: number } {
  if (lastFrameTimestampMs === null) {
    return { frozen: true, silenceDurationMs: Infinity };
  }
  const silenceDurationMs = Math.max(0, nowMs - lastFrameTimestampMs);
  return {
    frozen: silenceDurationMs >= freezeThresholdMs,
    silenceDurationMs,
  };
}

export function criarAmostraDiagnostico(params: {
  timestamp: number;
  rafTimestamps: readonly number[];
  videoFrameTimestamps: readonly number[];
  inferenceSamplesMs: readonly number[];
  videoDimensions: { width: number; height: number } | null;
  rtcConnectionState: string;
  iceConnectionState: string;
  trackingState: string;
  effectMode: EffectMode;
  quality: RenderQuality;
  signalingRttMs: number | null;
}): DiagnosticSample {
  const inf = medirInferencia(params.inferenceSamplesMs);
  return {
    timestamp: params.timestamp,
    renderFps: medirRenderFPS(params.rafTimestamps),
    videoFps: medirVideoFPS(params.videoFrameTimestamps),
    inferenceDurationMsP50: inf.p50,
    inferenceDurationMsP95: inf.p95,
    videoDimensions: params.videoDimensions,
    rtcConnectionState: params.rtcConnectionState,
    iceConnectionState: params.iceConnectionState,
    trackingState: params.trackingState,
    effectMode: params.effectMode,
    quality: params.quality,
    signalingRttMs: params.signalingRttMs,
    // Rule from INDEX.md & ISSUE-009: never conflate signaling RTT with physical motion-to-photon latency
    physicalMotionToPhotonLatencyMs: 'NOT_MEASURED',
  };
}
