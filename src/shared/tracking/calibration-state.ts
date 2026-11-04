export type CalibrationPhase = 'UNINITIALIZED' | 'CALIBRATING' | 'CALIBRATED' | 'LOST';

export interface CalibrationMetrics {
  baselinePalmSize: number;
  baselineShoulderSpan: number;
  calibratedAtMs: number | null;
  progress: number;
}

export interface CalibrationSnapshot {
  phase: CalibrationPhase;
  metrics: CalibrationMetrics;
  framesCollected: number;
  lostSinceMs: number | null;
}

const REQUIRED_CALIBRATION_FRAMES = 10;
const LOST_TIMEOUT_MS = 1200;

export class CalibrationStateMachine {
  private phase: CalibrationPhase = 'UNINITIALIZED';
  private palmSamples: number[] = [];
  private shoulderSamples: number[] = [];
  private baselinePalmSize = 0.14;
  private baselineShoulderSpan = 0.28;
  private calibratedAtMs: number | null = null;
  private lastSeenMs: number | null = null;
  private lostSinceMs: number | null = null;

  public getSnapshot(): CalibrationSnapshot {
    return {
      phase: this.phase,
      metrics: {
        baselinePalmSize: this.baselinePalmSize,
        baselineShoulderSpan: this.baselineShoulderSpan,
        calibratedAtMs: this.calibratedAtMs,
        progress: Math.min(1, this.palmSamples.length / REQUIRED_CALIBRATION_FRAMES),
      },
      framesCollected: this.palmSamples.length,
      lostSinceMs: this.lostSinceMs,
    };
  }

  public reset(): CalibrationSnapshot {
    this.phase = 'UNINITIALIZED';
    this.palmSamples = [];
    this.shoulderSamples = [];
    this.calibratedAtMs = null;
    this.lastSeenMs = null;
    this.lostSinceMs = null;
    return this.getSnapshot();
  }

  public startManualCalibration(): CalibrationSnapshot {
    this.palmSamples = [];
    this.shoulderSamples = [];
    this.phase = 'CALIBRATING';
    this.lostSinceMs = null;
    return this.getSnapshot();
  }

  public step(input: {
    hasDetection: boolean;
    palmSpan?: number;
    shoulderSpan?: number;
    timestampMs: number;
  }): CalibrationSnapshot {
    if (!input.hasDetection) {
      if (this.phase === 'CALIBRATED' || this.phase === 'CALIBRATING') {
        if (this.lastSeenMs !== null && input.timestampMs - this.lastSeenMs >= LOST_TIMEOUT_MS) {
          this.phase = 'LOST';
          if (this.lostSinceMs === null) {
            this.lostSinceMs = input.timestampMs;
          }
        }
      }
      return this.getSnapshot();
    }

    this.lastSeenMs = input.timestampMs;
    this.lostSinceMs = null;

    if (this.phase === 'LOST' && this.calibratedAtMs !== null) {
      this.phase = 'CALIBRATED';
      return this.getSnapshot();
    }

    if (this.phase === 'UNINITIALIZED') {
      this.phase = 'CALIBRATING';
    }

    if (this.phase === 'CALIBRATING') {
      if (typeof input.palmSpan === 'number' && input.palmSpan > 0.02) {
        this.palmSamples.push(input.palmSpan);
      }
      if (typeof input.shoulderSpan === 'number' && input.shoulderSpan > 0.05) {
        this.shoulderSamples.push(input.shoulderSpan);
      }
      if (this.palmSamples.length >= REQUIRED_CALIBRATION_FRAMES) {
        const avgPalm = this.palmSamples.reduce((acc, v) => acc + v, 0) / this.palmSamples.length;
        this.baselinePalmSize = Math.max(0.05, Math.min(0.45, avgPalm));
        if (this.shoulderSamples.length > 0) {
          const avgShoulder = this.shoulderSamples.reduce((acc, v) => acc + v, 0) / this.shoulderSamples.length;
          this.baselineShoulderSpan = Math.max(0.1, Math.min(0.8, avgShoulder));
        }
        this.phase = 'CALIBRATED';
        this.calibratedAtMs = input.timestampMs;
      }
    }

    return this.getSnapshot();
  }
}
