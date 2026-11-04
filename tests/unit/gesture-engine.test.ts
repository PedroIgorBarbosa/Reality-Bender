import { describe, expect, it } from 'vitest';
import { iniciarMediaPipeHands } from '../../src/client/tracking/mediapipe-tracker';
import { CalibrationStateMachine } from '../../src/shared/tracking/calibration-state';
import {
  calcularAberturaPalma,
  calcularCentroideMao,
  calcularDistanciaPinch,
  classificarGestoMao,
  suavizarGestos,
  type Landmark,
} from '../../src/shared/tracking/gesture-engine';
import { OneEuroFilter } from '../../src/shared/tracking/smoothing-filter';

function createHandFixture(mode: 'OPEN_PALM' | 'CLOSED_FIST' | 'PINCH' | 'INDEX_POINTING' | 'PEACE'): Landmark[] {
  const pts: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.6, z: 0 }));
  // Wrist at (0.5, 0.8)
  pts[0] = { x: 0.5, y: 0.8, z: 0 };
  // MCP joints around y=0.65
  pts[2] = { x: 0.38, y: 0.72, z: 0 };
  pts[5] = { x: 0.44, y: 0.65, z: 0 };
  pts[6] = { x: 0.44, y: 0.58, z: 0 };
  pts[9] = { x: 0.5, y: 0.64, z: 0 };
  pts[10] = { x: 0.5, y: 0.57, z: 0 };
  pts[13] = { x: 0.55, y: 0.65, z: 0 };
  pts[14] = { x: 0.55, y: 0.58, z: 0 };
  pts[17] = { x: 0.6, y: 0.67, z: 0 };
  pts[18] = { x: 0.6, y: 0.6, z: 0 };

  if (mode === 'OPEN_PALM') {
    pts[4] = { x: 0.3, y: 0.62, z: 0 };
    pts[8] = { x: 0.42, y: 0.38, z: 0 };
    pts[12] = { x: 0.5, y: 0.35, z: 0 };
    pts[16] = { x: 0.57, y: 0.38, z: 0 };
    pts[20] = { x: 0.65, y: 0.42, z: 0 };
  } else if (mode === 'CLOSED_FIST') {
    pts[4] = { x: 0.46, y: 0.68, z: 0 };
    pts[8] = { x: 0.45, y: 0.66, z: 0 };
    pts[12] = { x: 0.5, y: 0.66, z: 0 };
    pts[16] = { x: 0.55, y: 0.66, z: 0 };
    pts[20] = { x: 0.59, y: 0.68, z: 0 };
  } else if (mode === 'PINCH') {
    pts[4] = { x: 0.45, y: 0.48, z: 0 };
    pts[8] = { x: 0.46, y: 0.49, z: 0 };
    pts[12] = { x: 0.5, y: 0.35, z: 0 };
    pts[16] = { x: 0.57, y: 0.38, z: 0 };
    pts[20] = { x: 0.65, y: 0.42, z: 0 };
  } else if (mode === 'INDEX_POINTING') {
    pts[4] = { x: 0.46, y: 0.68, z: 0 };
    pts[8] = { x: 0.44, y: 0.36, z: 0 };
    pts[12] = { x: 0.5, y: 0.66, z: 0 };
    pts[16] = { x: 0.55, y: 0.66, z: 0 };
    pts[20] = { x: 0.59, y: 0.68, z: 0 };
  } else if (mode === 'PEACE') {
    pts[4] = { x: 0.46, y: 0.68, z: 0 };
    pts[8] = { x: 0.44, y: 0.36, z: 0 };
    pts[12] = { x: 0.52, y: 0.35, z: 0 };
    pts[16] = { x: 0.55, y: 0.66, z: 0 };
    pts[20] = { x: 0.59, y: 0.68, z: 0 };
  }
  return pts;
}

describe('MediaPipe Gesture Engine, OneEuroFilter & Calibration FSM (Issue #5)', () => {
  it('classifica corretamente OPEN_PALM, CLOSED_FIST, PINCH, INDEX_POINTING e PEACE', () => {
    const open = createHandFixture('OPEN_PALM');
    const fist = createHandFixture('CLOSED_FIST');
    const pinch = createHandFixture('PINCH');
    const pointing = createHandFixture('INDEX_POINTING');
    const peace = createHandFixture('PEACE');

    expect(classificarGestoMao(open).gesture).toBe('OPEN_PALM');
    expect(classificarGestoMao(fist).gesture).toBe('CLOSED_FIST');
    expect(classificarGestoMao(pinch).gesture).toBe('PINCH');
    expect(classificarGestoMao(pointing).gesture).toBe('INDEX_POINTING');
    expect(classificarGestoMao(peace).gesture).toBe('PEACE');

    expect(calcularAberturaPalma(open)).toBeGreaterThan(calcularAberturaPalma(fist));
    expect(calcularDistanciaPinch(pinch)).toBeLessThan(0.36);
    expect(calcularCentroideMao(open).x).toBeGreaterThan(0.3);
  });

  it('suaviza ruído com OneEuroFilter e estabiliza gestos na janela temporal', () => {
    const filter = new OneEuroFilter(1.2, 0.04);
    const v1 = filter.filter(0.5, 100);
    const v2 = filter.filter(0.52, 116);
    expect(v1).toBe(0.5);
    expect(v2).toBeGreaterThan(0.5);
    expect(v2).toBeLessThan(0.52);

    const smoothed = suavizarGestos(
      [
        {
          frameTimestamp: 100,
          hands: [],
          pose: null,
          handCount: 1,
          gestures: [
            {
              hand: 'Right',
              gesture: 'OPEN_PALM',
              confidence: 0.9,
              pinchDistance: 0.8,
              palmOpenness: 0.9,
              orientation: { angleRad: 0, pitchRad: 0, dirX: 0, dirY: -1, dirZ: 0 },
              centroid: { x: 0.5, y: 0.5, z: 0 },
            },
          ],
        },
        {
          frameTimestamp: 130,
          hands: [],
          pose: null,
          handCount: 1,
          gestures: [
            {
              hand: 'Right',
              gesture: 'OPEN_PALM',
              confidence: 0.92,
              pinchDistance: 0.8,
              palmOpenness: 0.9,
              orientation: { angleRad: 0, pitchRad: 0, dirX: 0, dirY: -1, dirZ: 0 },
              centroid: { x: 0.5, y: 0.5, z: 0 },
            },
          ],
        },
        {
          frameTimestamp: 160,
          hands: [],
          pose: null,
          handCount: 1,
          gestures: [
            {
              hand: 'Right',
              gesture: 'UNKNOWN',
              confidence: 0.5,
              pinchDistance: 0.8,
              palmOpenness: 0.9,
              orientation: { angleRad: 0, pitchRad: 0, dirX: 0, dirY: -1, dirZ: 0 },
              centroid: { x: 0.5, y: 0.5, z: 0 },
            },
          ],
        },
      ],
      200,
    );
    expect(smoothed.gestures[0].gesture).toBe('OPEN_PALM');
  });

  it('transita a máquina de calibração UNINITIALIZED -> CALIBRATING -> CALIBRATED -> LOST -> CALIBRATED', () => {
    const fsm = new CalibrationStateMachine();
    expect(fsm.getSnapshot().phase).toBe('UNINITIALIZED');

    for (let i = 1; i <= 10; i++) {
      const snap = fsm.step({ hasDetection: true, palmSpan: 0.16, shoulderSpan: 0.3, timestampMs: i * 100 });
      if (i < 10) expect(snap.phase).toBe('CALIBRATING');
      else expect(snap.phase).toBe('CALIBRATED');
    }

    // Lose detection for > 1200ms
    const lost = fsm.step({ hasDetection: false, timestampMs: 2500 });
    expect(lost.phase).toBe('LOST');

    // Recover immediately when hand returns
    const recovered = fsm.step({ hasDetection: true, palmSpan: 0.16, timestampMs: 2600 });
    expect(recovered.phase).toBe('CALIBRATED');
  });

  it('aplica backpressure descartando quadros concorrentes em iniciarMediaPipeHands (CT-010-4)', async () => {
    let resolveSlowFrame: (() => void) | null = null;
    const detector = await iniciarMediaPipeHands({
      detectorAdapter: {
        async detectHandsAndPose() {
          await new Promise<void>((res) => {
            resolveSlowFrame = res;
          });
          return { hands: [{ hand: 'Right', landmarks: createHandFixture('OPEN_PALM'), score: 0.95 }] };
        },
      },
    });

    const p1 = detector.processVideoFrame({}, 100);
    // While frame 100 is still inferring, frame 116 arrives -> must be dropped immediately without queueing
    const p2 = await detector.processVideoFrame({}, 116);
    expect(p2.droppedForBackpressure).toBe(true);
    expect(detector.getDroppedFrameCount()).toBe(1);

    resolveSlowFrame!();
    const res1 = await p1;
    expect(res1.droppedForBackpressure).toBe(false);
    expect(res1.frame.handCount).toBe(1);

    detector.dispose();
  });
});
