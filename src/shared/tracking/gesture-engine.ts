export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export type HandLandmarks = readonly Landmark[];
export type PoseLandmarks = readonly Landmark[];

export type GestureType =
  | 'OPEN_PALM'
  | 'CLOSED_FIST'
  | 'PINCH'
  | 'INDEX_POINTING'
  | 'PEACE'
  | 'UNKNOWN';

export interface HandOrientation {
  angleRad: number;
  pitchRad: number;
  dirX: number;
  dirY: number;
  dirZ: number;
}

export interface NormalizedHand {
  hand: 'Left' | 'Right';
  landmarks: HandLandmarks;
  worldLandmarks: HandLandmarks | null;
  score: number;
}

export interface HandGestureSummary {
  hand: 'Left' | 'Right';
  gesture: GestureType;
  confidence: number;
  pinchDistance: number | null;
  palmOpenness: number;
  orientation: HandOrientation;
  centroid: { x: number; y: number; z: number };
}

export interface GestureFrame {
  frameTimestamp: number;
  hands: NormalizedHand[];
  pose: PoseLandmarks | null;
  gestures: HandGestureSummary[];
  handCount: number;
}

function dist3d(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
}

export function normalizarLandmarks(rawLandmarks: readonly { x: number; y: number; z?: number; visibility?: number }[]): HandLandmarks {
  if (!Array.isArray(rawLandmarks) || rawLandmarks.length === 0) {
    return [];
  }
  return rawLandmarks.map((pt) => ({
    x: Math.min(1, Math.max(0, Number.isFinite(pt.x) ? pt.x : 0)),
    y: Math.min(1, Math.max(0, Number.isFinite(pt.y) ? pt.y : 0)),
    z: Number.isFinite(pt.z ?? 0) ? (pt.z ?? 0) : 0,
    visibility: pt.visibility,
  }));
}

export function calcularDistanciaPinch(landmarks: HandLandmarks): number {
  if (landmarks.length < 21) return 1.0;
  const thumbTip = landmarks[4];
  const indexTip = landmarks[8];
  const wrist = landmarks[0];
  const middleMcp = landmarks[9];
  const palmScale = Math.max(0.04, dist3d(wrist, middleMcp));
  return dist3d(thumbTip, indexTip) / palmScale;
}

export function calcularCentroideMao(landmarks: HandLandmarks): { x: number; y: number; z: number } {
  if (landmarks.length === 0) return { x: 0.5, y: 0.5, z: 0 };
  const palmIndices = landmarks.length >= 21 ? [0, 5, 9, 13, 17] : landmarks.map((_, i) => i);
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const idx of palmIndices) {
    const pt = landmarks[idx];
    sx += pt.x;
    sy += pt.y;
    sz += pt.z;
  }
  const n = palmIndices.length;
  return { x: sx / n, y: sy / n, z: sz / n };
}

export function calcularAberturaPalma(landmarks: HandLandmarks): number {
  if (landmarks.length < 21) return 0;
  const wrist = landmarks[0];
  const middleMcp = landmarks[9];
  const palmRef = Math.max(0.04, dist3d(wrist, middleMcp));
  const tipIndices = [4, 8, 12, 16, 20];
  const avgTipDist =
    tipIndices.reduce((acc, idx) => acc + dist3d(wrist, landmarks[idx]), 0) / tipIndices.length;
  const ratio = (avgTipDist / palmRef - 0.9) / 1.15;
  return Math.min(1, Math.max(0, ratio));
}

export function calcularOrientacaoMao(landmarks: HandLandmarks): HandOrientation {
  if (landmarks.length < 10) {
    return { angleRad: 0, pitchRad: 0, dirX: 0, dirY: -1, dirZ: 0 };
  }
  const wrist = landmarks[0];
  const middleMcp = landmarks[9];
  const dx = middleMcp.x - wrist.x;
  const dy = middleMcp.y - wrist.y;
  const dz = (middleMcp.z || 0) - (wrist.z || 0);
  const len = Math.max(1e-6, Math.hypot(dx, dy, dz));
  return {
    angleRad: Math.atan2(dy, dx),
    pitchRad: Math.asin(Math.max(-1, Math.min(1, dz / len))),
    dirX: dx / len,
    dirY: dy / len,
    dirZ: dz / len,
  };
}

export function classificarGestoMao(landmarks: HandLandmarks): { gesture: GestureType; confidence: number } {
  if (landmarks.length < 21) {
    return { gesture: 'UNKNOWN', confidence: 0 };
  }
  const wrist = landmarks[0];
  const isExtended = (tipIdx: number, pipIdx: number): boolean => {
    return dist3d(wrist, landmarks[tipIdx]) > dist3d(wrist, landmarks[pipIdx]) * 1.12;
  };

  const thumbExt = dist3d(landmarks[17], landmarks[4]) > dist3d(landmarks[17], landmarks[2]) * 1.15;
  const indexExt = isExtended(8, 6);
  const middleExt = isExtended(12, 10);
  const ringExt = isExtended(16, 14);
  const pinkyExt = isExtended(20, 18);

  const pinchRatio = calcularDistanciaPinch(landmarks);
  const openness = calcularAberturaPalma(landmarks);

  // Pinch: thumb and index tips meet while other fingers are extended or palm is open
  if (pinchRatio < 0.36 && (middleExt || ringExt || pinkyExt || openness >= 0.25)) {
    return { gesture: 'PINCH', confidence: Math.min(0.99, Math.max(0.75, 1 - pinchRatio)) };
  }

  const extendedCount = [thumbExt, indexExt, middleExt, ringExt, pinkyExt].filter(Boolean).length;
  if (extendedCount >= 4 && indexExt && middleExt && ringExt) {
    return { gesture: 'OPEN_PALM', confidence: 0.92 };
  }
  if (extendedCount === 0 || (!indexExt && !middleExt && !ringExt && !pinkyExt)) {
    return { gesture: 'CLOSED_FIST', confidence: 0.9 };
  }
  if (indexExt && !middleExt && !ringExt && !pinkyExt) {
    return { gesture: 'INDEX_POINTING', confidence: 0.88 };
  }
  if (indexExt && middleExt && !ringExt && !pinkyExt) {
    return { gesture: 'PEACE', confidence: 0.86 };
  }

  return { gesture: 'UNKNOWN', confidence: 0.5 };
}

export function detectarGestosEmQuadro(
  input: {
    hands?: ReadonlyArray<{
      hand?: 'Left' | 'Right';
      landmarks: readonly { x: number; y: number; z?: number; visibility?: number }[];
      worldLandmarks?: readonly { x: number; y: number; z?: number; visibility?: number }[] | null;
      score?: number;
    }>;
    pose?: readonly { x: number; y: number; z?: number; visibility?: number }[] | null;
  },
  timestampMs: number,
): GestureFrame {
  const rawHands = (input.hands ?? []).slice(0, 2);
  const normalizedHands: NormalizedHand[] = [];
  const gestures: HandGestureSummary[] = [];

  for (const h of rawHands) {
    const score = typeof h.score === 'number' ? h.score : 0.95;
    if (score < 0.7) continue;
    const handSide: 'Left' | 'Right' = h.hand === 'Left' ? 'Left' : 'Right';
    const landmarks = normalizarLandmarks(h.landmarks);
    if (landmarks.length < 21) continue;
    const worldLandmarks = h.worldLandmarks ? normalizarLandmarks(h.worldLandmarks) : null;
    normalizedHands.push({ hand: handSide, landmarks, worldLandmarks, score });

    const classification = classificarGestoMao(landmarks);
    const pinchDistance = calcularDistanciaPinch(landmarks);
    const palmOpenness = calcularAberturaPalma(landmarks);
    const orientation = calcularOrientacaoMao(landmarks);
    const centroid = calcularCentroideMao(landmarks);

    gestures.push({
      hand: handSide,
      gesture: classification.confidence >= 0.7 ? classification.gesture : 'UNKNOWN',
      confidence: classification.confidence,
      pinchDistance,
      palmOpenness,
      orientation,
      centroid,
    });
  }

  const pose = input.pose ? normalizarLandmarks(input.pose) : null;

  return {
    frameTimestamp: timestampMs,
    hands: normalizedHands,
    pose,
    gestures,
    handCount: normalizedHands.length,
  };
}

export function suavizarGestos(historico: readonly GestureFrame[], janelaMs = 200): GestureFrame {
  if (historico.length === 0) {
    return { frameTimestamp: 0, hands: [], pose: null, gestures: [], handCount: 0 };
  }
  const latest = historico[historico.length - 1];
  const minTime = latest.frameTimestamp - janelaMs;
  const windowFrames = historico.filter((f) => f.frameTimestamp >= minTime);
  if (windowFrames.length <= 1) return latest;

  const smoothedGestures: HandGestureSummary[] = latest.gestures.map((g) => {
    const votes = new Map<GestureType, number>();
    for (const frame of windowFrames) {
      const matching = frame.gestures.find((item) => item.hand === g.hand);
      if (matching) {
        votes.set(matching.gesture, (votes.get(matching.gesture) ?? 0) + matching.confidence);
      }
    }
    let bestGesture = g.gesture;
    let bestScore = -1;
    for (const [candidate, totalWeight] of votes.entries()) {
      if (totalWeight > bestScore) {
        bestScore = totalWeight;
        bestGesture = candidate;
      }
    }
    return {
      ...g,
      gesture: bestGesture,
    };
  });

  return {
    ...latest,
    gestures: smoothedGestures,
  };
}
