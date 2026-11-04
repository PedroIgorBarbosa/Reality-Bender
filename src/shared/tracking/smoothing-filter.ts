import type { Landmark } from './gesture-engine';

export class OneEuroFilter {
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev: number | null = null;

  constructor(
    private readonly minCutoff = 1.2,
    private readonly beta = 0.04,
    private readonly dCutoff = 1.0,
  ) {}

  private alpha(cutoff: number, dt: number): number {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / Math.max(dt, 1e-4));
  }

  public filter(value: number, timestampMs: number): number {
    if (this.xPrev === null || this.tPrev === null) {
      this.xPrev = value;
      this.tPrev = timestampMs;
      return value;
    }
    const dt = Math.max((timestampMs - this.tPrev) / 1000, 1 / 240);
    this.tPrev = timestampMs;

    const dx = (value - this.xPrev) / dt;
    const edx = this.dxPrev + this.alpha(this.dCutoff, dt) * (dx - this.dxPrev);
    this.dxPrev = edx;

    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    const filtered = this.xPrev + this.alpha(cutoff, dt) * (value - this.xPrev);
    this.xPrev = filtered;
    return filtered;
  }

  public reset(): void {
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
  }
}

export class LandmarkBankSmoother {
  private readonly filters = new Map<string, { x: OneEuroFilter; y: OneEuroFilter; z: OneEuroFilter }>();

  constructor(
    private readonly minCutoff = 1.4,
    private readonly beta = 0.05,
  ) {}

  public smoothLandmarks(keyPrefix: string, landmarks: readonly Landmark[], timestampMs: number): Landmark[] {
    return landmarks.map((pt, index) => {
      const key = `${keyPrefix}:${index}`;
      let bank = this.filters.get(key);
      if (!bank) {
        bank = {
          x: new OneEuroFilter(this.minCutoff, this.beta),
          y: new OneEuroFilter(this.minCutoff, this.beta),
          z: new OneEuroFilter(this.minCutoff, this.beta),
        };
        this.filters.set(key, bank);
      }
      return {
        x: Math.min(1, Math.max(0, bank.x.filter(pt.x, timestampMs))),
        y: Math.min(1, Math.max(0, bank.y.filter(pt.y, timestampMs))),
        z: bank.z.filter(pt.z, timestampMs),
        visibility: pt.visibility,
      };
    });
  }

  public reset(): void {
    this.filters.clear();
  }
}
