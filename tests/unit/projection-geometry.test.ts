import { describe, expect, it } from 'vitest';
import {
  QUALITY_PROFILES,
  computeContentRect,
  stageCssToNormalized,
  videoNormalizedToStage,
} from '../../src/shared/geometry/projection-geometry';

describe('Projection Geometry & videoNormalizedToStage (Issue #4)', () => {
  it('calcula letterbox/pillarbox em modo contain para vídeo retrato (720x1280) em palco 1920x1080', () => {
    const rect = computeContentRect(
      { widthPx: 720, heightPx: 1280 },
      { cssWidth: 1920, cssHeight: 1080, dpr: 1 },
      { fit: 'contain', mirrored: true, orientationFromDecodedVideo: 'native' },
    );

    expect(rect.height).toBeCloseTo(1080, 2);
    expect(rect.width).toBeCloseTo(607.5, 2);
    expect(rect.left).toBeCloseTo((1920 - 607.5) / 2, 2);
    expect(rect.top).toBeCloseTo(0, 2);
  });

  it('mapeia coordenadas normalizadas para CSS e NDC respeitando espelhamento horizontal', () => {
    const video = { widthPx: 1280, heightPx: 720 };
    const stage = { cssWidth: 1280, cssHeight: 720, dpr: 1 };

    const mirroredResult = videoNormalizedToStage(
      { x: 0.25, y: 0.5, z: 0 },
      video,
      stage,
      { fit: 'contain', mirrored: true, orientationFromDecodedVideo: 'native' },
    );
    expect(mirroredResult.css.x).toBeCloseTo(960, 2);
    expect(mirroredResult.css.y).toBeCloseTo(360, 2);
    expect(mirroredResult.ndc.x).toBeCloseTo(0.5, 2);
    expect(mirroredResult.ndc.y).toBeCloseTo(0, 2);
    expect(mirroredResult.visible).toBe(true);

    const rect = computeContentRect(video, stage, {
      fit: 'contain',
      mirrored: true,
      orientationFromDecodedVideo: 'native',
    });
    const roundTrip = stageCssToNormalized(mirroredResult.css, rect, true);
    expect(roundTrip.x).toBeCloseTo(0.25, 2);
    expect(roundTrip.y).toBeCloseTo(0.5, 2);
  });

  it('define perfis de qualidade HIGH, MEDIUM e COMPAT conforme especificação', () => {
    expect(QUALITY_PROFILES.HIGH.particleBudget).toBe(4096);
    expect(QUALITY_PROFILES.MEDIUM.particleBudget).toBe(2048);
    expect(QUALITY_PROFILES.COMPAT.particleBudget).toBe(512);
  });
});
