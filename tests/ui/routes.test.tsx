import { describe, expect, it } from 'vitest';
import { ConnectionStatus } from '../../src/client/components/ConnectionStatus';
import { DiagnosticsHud } from '../../src/client/components/DiagnosticsHud';
import { ControlPage } from '../../src/client/routes/ControlPage';
import { NotFoundPage } from '../../src/client/routes/NotFoundPage';
import { StagePage } from '../../src/client/routes/StagePage';

function collectText(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(collectText).join(' ');
  if (typeof node === 'object' && 'type' in (node as Record<string, unknown>)) {
    const el = node as { type: unknown; props?: Record<string, unknown> };
    if (typeof el.type === 'function') {
      return collectText((el.type as (p: unknown) => unknown)(el.props ?? {}));
    }
    return collectText(el.props?.children);
  }
  return '';
}

describe('UI Components & Routes Rendering (Issues #1, #2, #4, #9)', () => {
  it('renderiza StagePage, ControlPage e NotFoundPage sem estados falsos de vídeo', () => {
    const stageTree = StagePage();
    const stageText = collectText(stageTree);
    expect(stageText).toContain('REALITY BENDER');
    expect(stageText).toContain('Criar sessão / QR Code');
    expect(stageText).toContain('SEM FONTE DE VÍDEO');

    const controlTree = ControlPage();
    const controlText = collectText(controlTree);
    expect(controlText).toContain('Controle móvel');
    expect(controlText).toContain('Parear com o Palco');

    const notFoundTree = NotFoundPage();
    const notFoundText = collectText(notFoundTree);
    expect(notFoundText).toContain('Página não encontrada');
  });

  it('renderiza ConnectionStatus e DiagnosticsHud com métricas rotuladas corretamente', () => {
    const statusTree = ConnectionStatus({
      state: { phase: 'ONLINE', protocolVersion: 1, connectedAt: '2026-11-03T12:00:00.000Z' },
    });
    expect(collectText(statusTree)).toContain('Servidor conectado');

    const hudTree = DiagnosticsHud({
      visible: true,
      videoFrozen: true,
      sample: {
        timestamp: 1000,
        renderFps: 60,
        videoFps: 30,
        inferenceDurationMsP50: 9.5,
        inferenceDurationMsP95: 14.2,
        videoDimensions: { width: 1280, height: 720 },
        rtcConnectionState: 'connected',
        iceConnectionState: 'connected',
        trackingState: 'CALIBRATED',
        effectMode: 'ENERGY',
        quality: 'HIGH',
        signalingRttMs: 5,
        physicalMotionToPhotonLatencyMs: 'NOT_MEASURED',
      },
    });
    const hudText = collectText(hudTree);
    expect(hudText).toContain('60 fps');
    expect(hudText).toContain('NOT_MEASURED');
    expect(hudText).toContain('Congelamento de vídeo detectado');
  });
});
