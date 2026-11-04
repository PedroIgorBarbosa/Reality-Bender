import { describe, expect, it } from 'vitest';
import {
  criarAmostraDiagnostico,
  medirInferencia,
  medirRenderFPS,
  verificarDisponibilidadeDeVideo,
} from '../../src/shared/diagnostics/metrics';
import {
  calcularEstatisticaFPS,
  calcularEstatisticaLatencia,
  inicializarMatriz,
  registrarExecucao,
  revisarRegressao,
} from '../../src/shared/homologation/homologation-matrix';

describe('Diagnostics, Freeze Detection & Homologation Matrix (Issues #9 & #10)', () => {
  it('calcula FPS de render/vídeo, percentis P50/P95 de inferência e detecta congelamento em 3s', () => {
    // 61 timestamps spaced by 16.666ms = 60 FPS
    const timestamps = Array.from({ length: 61 }, (_, i) => i * (1000 / 60));
    expect(medirRenderFPS(timestamps)).toBeCloseTo(60, 1);

    const inf = medirInferencia([8, 9, 10, 11, 12, 13, 14, 15, 16, 25]);
    expect(inf.p50).toBe(12);
    expect(inf.p95).toBe(25);

    expect(verificarDisponibilidadeDeVideo(1000, 3500, 3000).frozen).toBe(false);
    expect(verificarDisponibilidadeDeVideo(1000, 4000, 3000).frozen).toBe(true);

    const sample = criarAmostraDiagnostico({
      timestamp: 5000,
      rafTimestamps: timestamps,
      videoFrameTimestamps: timestamps,
      inferenceSamplesMs: [10, 12, 14],
      videoDimensions: { width: 1280, height: 720 },
      rtcConnectionState: 'connected',
      iceConnectionState: 'connected',
      trackingState: 'CALIBRATED',
      effectMode: 'ENERGY',
      quality: 'HIGH',
      signalingRttMs: 4,
    });
    expect(sample.physicalMotionToPhotonLatencyMs).toBe('NOT_MEASURED');
    expect(sample.signalingRttMs).toBe(4);
  });

  it('gerencia matriz de homologação CT-010-1..CT-010-7 e estatísticas de regressão (#10)', () => {
    const initial = inicializarMatriz();
    expect(initial.length).toBeGreaterThanOrEqual(7);
    expect(initial.every((item) => item.status === 'NOT_RUN')).toBe(true);

    const updated = registrarExecucao(initial, 'CT-010-1', {
      status: 'PASS',
      observedResult: 'Isolamento de sala verificado',
    });
    expect(updated.find((x) => x.id === 'CT-010-1')?.status).toBe('PASS');

    const fpsStats = calcularEstatisticaFPS([55, 58, 60, 60]);
    expect(fpsStats.min).toBe(55);
    expect(fpsStats.max).toBe(60);

    const latStats = calcularEstatisticaLatencia([10, 12, 15, 20]);
    expect(latStats.p95).toBe(20);

    expect(revisarRegressao({ p95Ms: 20, minFps: 50 }, { p95Ms: 18, minFps: 55 }).passed).toBe(true);
    expect(revisarRegressao({ p95Ms: 20, minFps: 50 }, { p95Ms: 35, minFps: 30 }).passed).toBe(false);
  });
});
