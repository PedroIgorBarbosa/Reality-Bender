import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { ConnectionStatus } from '../../src/client/components/ConnectionStatus';
import { DiagnosticsHud } from '../../src/client/components/DiagnosticsHud';
import { ControlPage } from '../../src/client/routes/ControlPage';
import { NotFoundPage } from '../../src/client/routes/NotFoundPage';
import { StagePage } from '../../src/client/routes/StagePage';

describe('UI Components & Routes Rendering (Issues #1, #2, #4, #9)', () => {
  it('renderiza StagePage, ControlPage e NotFoundPage sem estados falsos de vídeo', () => {
    const stageHtml = renderToStaticMarkup(<MemoryRouter><StagePage /></MemoryRouter>);
    expect(stageHtml).toContain('REALITY BENDER');
    expect(stageHtml).toContain('Criar sessão / QR Code');
    expect(stageHtml).toContain('SEM FONTE DE VÍDEO');

    const controlHtml = renderToStaticMarkup(<MemoryRouter><ControlPage /></MemoryRouter>);
    expect(controlHtml).toContain('Controle móvel');
    expect(controlHtml).toContain('Parear com o Palco');

    const notFoundHtml = renderToStaticMarkup(<MemoryRouter><NotFoundPage /></MemoryRouter>);
    expect(notFoundHtml).toContain('Página não encontrada');
  });

  it('renderiza ConnectionStatus e DiagnosticsHud com métricas rotuladas corretamente', () => {
    const statusHtml = renderToStaticMarkup(
      <ConnectionStatus state={{ phase: 'ONLINE', protocolVersion: 1, connectedAt: '2026-11-03T12:00:00.000Z' }} />,
    );
    expect(statusHtml).toContain('Servidor conectado');

    const hudHtml = renderToStaticMarkup(
      <DiagnosticsHud
        visible
        videoFrozen
        sample={{
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
        }}
      />,
    );
    expect(hudHtml).toContain('60 fps');
    expect(hudHtml).toContain('NOT_MEASURED');
    expect(hudHtml).toContain('Congelamento de vídeo detectado');
  });
});
