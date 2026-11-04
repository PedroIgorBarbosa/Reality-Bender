import { CalibrationStateMachine, type CalibrationSnapshot } from '../../shared/tracking/calibration-state';
import {
  detectarGestosEmQuadro,
  suavizarGestos,
  type GestureFrame,
  type Landmark,
} from '../../shared/tracking/gesture-engine';
import { LandmarkBankSmoother } from '../../shared/tracking/smoothing-filter';

export interface MediaPipeConfig {
  maxHands?: number;
  minDetectionConfidence?: number;
  minTrackingConfidence?: number;
  smoothingWindowMs?: number;
  detectorAdapter?: {
    detectHandsAndPose: (frameSource: unknown, timestampMs: number) => Promise<{
      hands?: Array<{ hand?: 'Left' | 'Right'; landmarks: Landmark[]; score?: number }>;
      pose?: Landmark[] | null;
    }>;
  };
}

export interface HandsDetector {
  processVideoFrame: (frameSource: unknown, timestampMs: number) => Promise<{
    frame: GestureFrame;
    calibration: CalibrationSnapshot;
    droppedForBackpressure: boolean;
    inferenceDurationMs: number;
  }>;
  getLatestFrame: () => GestureFrame | null;
  getCalibration: () => CalibrationSnapshot;
  triggerCalibration: () => CalibrationSnapshot;
  getDroppedFrameCount: () => number;
  dispose: () => void;
}

export async function iniciarMediaPipeHands(config: MediaPipeConfig = {}): Promise<HandsDetector> {
  const smoother = new LandmarkBankSmoother(1.4, 0.05);
  const calibration = new CalibrationStateMachine();
  const history: GestureFrame[] = [];
  const smoothingWindowMs = config.smoothingWindowMs ?? 180;

  let isInferring = false;
  let lastTimestampMs = -1;
  let droppedFrames = 0;
  let latestFrame: GestureFrame | null = null;
  let disposed = false;

  return {
    async processVideoFrame(frameSource: unknown, timestampMs: number) {
      if (disposed) {
        throw new Error('HandsDetector já foi descartado');
      }
      // Backpressure guard (Issue #5 & CT-010-4): never queue frames if inference is busy or non-monotonic
      if (isInferring || timestampMs <= lastTimestampMs) {
        droppedFrames += 1;
        return {
          frame: latestFrame ?? { frameTimestamp: timestampMs, hands: [], pose: null, gestures: [], handCount: 0 },
          calibration: calibration.getSnapshot(),
          droppedForBackpressure: true,
          inferenceDurationMs: 0,
        };
      }

      isInferring = true;
      lastTimestampMs = timestampMs;
      const startPerf = typeof performance !== 'undefined' ? performance.now() : Date.now();

      try {
        let rawDetection: {
          hands?: Array<{ hand?: 'Left' | 'Right'; landmarks: Landmark[]; score?: number }>;
          pose?: Landmark[] | null;
        } = { hands: [], pose: null };

        if (config.detectorAdapter) {
          rawDetection = await config.detectorAdapter.detectHandsAndPose(frameSource, timestampMs);
        } else if (
          frameSource &&
          typeof frameSource === 'object' &&
          '__landmarksPayload' in (frameSource as Record<string, unknown>)
        ) {
          rawDetection = (frameSource as { __landmarksPayload: typeof rawDetection }).__landmarksPayload;
        }

        const smoothedHands = (rawDetection.hands ?? []).slice(0, config.maxHands ?? 2).map((h, idx) => ({
          hand: h.hand ?? (idx === 0 ? 'Right' : 'Left'),
          score: h.score ?? 0.95,
          landmarks: smoother.smoothLandmarks(`hand-${h.hand ?? idx}`, h.landmarks, timestampMs),
        }));

        const smoothedPose = rawDetection.pose
          ? smoother.smoothLandmarks('pose', rawDetection.pose, timestampMs)
          : null;

        const rawFrame = detectarGestosEmQuadro(
          { hands: smoothedHands, pose: smoothedPose },
          timestampMs,
        );

        history.push(rawFrame);
        while (history.length > 12) {
          history.shift();
        }

        const smoothedFrame = suavizarGestos(history, smoothingWindowMs);
        latestFrame = smoothedFrame;

        let palmSpan: number | undefined;
        if (smoothedFrame.hands.length > 0) {
          const lm = smoothedFrame.hands[0].landmarks;
          palmSpan = Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y);
        }

        let shoulderSpan: number | undefined;
        if (smoothedPose && smoothedPose.length >= 13) {
          shoulderSpan = Math.hypot(
            smoothedPose[11].x - smoothedPose[12].x,
            smoothedPose[11].y - smoothedPose[12].y,
          );
        }

        const calSnapshot = calibration.step({
          hasDetection: smoothedFrame.handCount > 0 || Boolean(smoothedPose && smoothedPose.length > 0),
          palmSpan,
          shoulderSpan,
          timestampMs,
        });

        const endPerf = typeof performance !== 'undefined' ? performance.now() : Date.now();
        return {
          frame: smoothedFrame,
          calibration: calSnapshot,
          droppedForBackpressure: false,
          inferenceDurationMs: Math.max(0, endPerf - startPerf),
        };
      } finally {
        isInferring = false;
      }
    },

    getLatestFrame() {
      return latestFrame;
    },

    getCalibration() {
      return calibration.getSnapshot();
    },

    triggerCalibration() {
      return calibration.startManualCalibration();
    },

    getDroppedFrameCount() {
      return droppedFrames;
    },

    dispose() {
      disposed = true;
      smoother.reset();
      history.length = 0;
      latestFrame = null;
    },
  };
}
