import * as THREE from 'three';
import type { RenderQuality } from '../../shared/contracts/system-events';
import {
  QUALITY_PROFILES,
  videoNormalizedToStage,
  type GeometryConfig,
  type StageDimensions,
  type VideoDimensions,
} from '../../shared/geometry/projection-geometry';
import type { GestureFrame } from '../../shared/tracking/gesture-engine';
import { GpuResourceTracker, type EffectPlugin } from './effect-plugin';

export interface LightningSegment {
  start: { x: number; y: number; z: number };
  end: { x: number; y: number; z: number };
}

export interface LightningBolt {
  segments: LightningSegment[];
  amplitude: number;
  lifeTimeMs: number;
}

export interface ElectricAuraState {
  active: boolean;
  boltCount: number;
  intensity: number;
  jitterFrequency: number;
  colorTint: { r: number; g: number; b: number };
  bolts: LightningBolt[];
}

function pseudoNoise(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

export function gerarRayosEletricos(
  origem: { x: number; y: number; z?: number },
  destino: { x: number; y: number; z?: number },
  ramificacoes = 2,
  seed = 1,
): LightningBolt {
  const subdivisions = 5;
  const z0 = origem.z ?? 0;
  const z1 = destino.z ?? 0;
  const dx = destino.x - origem.x;
  const dy = destino.y - origem.y;
  const length = Math.hypot(dx, dy, z1 - z0);
  const amplitude = Math.max(0.015, length * 0.16);
  const perpX = length > 1e-5 ? -dy / length : 0;
  const perpY = length > 1e-5 ? dx / length : 1;

  const mainPoints: Array<{ x: number; y: number; z: number }> = [];
  for (let i = 0; i <= subdivisions; i++) {
    const t = i / subdivisions;
    const envelope = Math.sin(t * Math.PI);
    const jitter = pseudoNoise(seed + i * 17.3) * amplitude * envelope;
    mainPoints.push({
      x: origem.x + dx * t + perpX * jitter,
      y: origem.y + dy * t + perpY * jitter,
      z: z0 + (z1 - z0) * t,
    });
  }

  const segments: LightningSegment[] = [];
  for (let i = 0; i < mainPoints.length - 1; i++) {
    segments.push({ start: mainPoints[i], end: mainPoints[i + 1] });
  }

  const branchCount = Math.max(0, Math.min(6, ramificacoes));
  for (let b = 0; b < branchCount; b++) {
    const idx = Math.min(mainPoints.length - 2, 1 + (b % Math.max(1, mainPoints.length - 2)));
    const anchor = mainPoints[idx];
    const branchAngle = Math.atan2(dy, dx) + (b % 2 === 0 ? 0.65 : -0.65);
    const branchLen = Math.max(0.04, length * 0.35);
    const mid = {
      x: anchor.x + Math.cos(branchAngle) * (branchLen * 0.5) + pseudoNoise(seed + b * 31) * amplitude * 0.5,
      y: anchor.y + Math.sin(branchAngle) * (branchLen * 0.5) + pseudoNoise(seed + b * 43) * amplitude * 0.5,
      z: anchor.z,
    };
    const tip = {
      x: anchor.x + Math.cos(branchAngle) * branchLen,
      y: anchor.y + Math.sin(branchAngle) * branchLen,
      z: anchor.z,
    };
    segments.push({ start: anchor, end: mid }, { start: mid, end: tip });
  }

  return {
    segments,
    amplitude,
    lifeTimeMs: 85,
  };
}

export function atualizarAuraCorpo(
  silhuetaLandmarks: ReadonlyArray<{ x: number; y: number; z?: number }>,
  tempoMs: number,
  velocidadeMovimento = 0.2,
  maxBolts = 10,
): ElectricAuraState {
  if (!silhuetaLandmarks || silhuetaLandmarks.length < 2) {
    return {
      active: false,
      boltCount: 0,
      intensity: 0,
      jitterFrequency: 0,
      colorTint: { r: 0.3, g: 0.85, b: 1.0 },
      bolts: [],
    };
  }

  const clampedVel = Math.max(0, Math.min(2.5, velocidadeMovimento));
  const intensity = Math.min(1.0, 0.4 + clampedVel * 0.35);
  const branches = clampedVel > 0.8 ? 3 : clampedVel > 0.3 ? 2 : 1;
  const bolts: LightningBolt[] = [];

  // Connect sequential body/arm silhouette anchors (shoulders, elbows, wrists, torso)
  const limit = Math.min(maxBolts, silhuetaLandmarks.length - 1);
  for (let i = 0; i < limit; i++) {
    const start = silhuetaLandmarks[i];
    const end = silhuetaLandmarks[(i + 1) % silhuetaLandmarks.length];
    bolts.push(gerarRayosEletricos(start, end, branches, Math.floor(tempoMs / 30) + i * 13));
  }

  return {
    active: true,
    boltCount: bolts.length,
    intensity,
    jitterFrequency: 18 + clampedVel * 22,
    colorTint: {
      r: Math.min(1, 0.25 + intensity * 0.45),
      g: Math.min(1, 0.8 + intensity * 0.2),
      b: 1.0,
    },
    bolts,
  };
}

export function renderizarAura(target: unknown, auraState: ElectricAuraState): void {
  if (target && typeof target === 'object' && 'visible' in target) {
    const lineObj = target as THREE.LineSegments;
    lineObj.visible = auraState.active && auraState.boltCount > 0;
    const attr = lineObj.geometry?.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (attr && attr.array) {
      const arr = attr.array as Float32Array;
      let offset = 0;
      for (const bolt of auraState.bolts) {
        for (const seg of bolt.segments) {
          if (offset + 6 > arr.length) break;
          arr[offset++] = seg.start.x;
          arr[offset++] = seg.start.y;
          arr[offset++] = seg.start.z;
          arr[offset++] = seg.end.x;
          arr[offset++] = seg.end.y;
          arr[offset++] = seg.end.z;
        }
      }
      for (let i = offset; i < arr.length; i++) {
        arr[i] = 0;
      }
      attr.needsUpdate = true;
    }
  }
}

export function createElectricAuraPlugin(): EffectPlugin {
  const tracker = new GpuResourceTracker();
  let lines: THREE.LineSegments | null = null;
  let parentScene: THREE.Scene | null = null;
  let maxBolts = 10;
  let prevAnchorCentroid: { x: number; y: number } | null = null;

  return {
    id: 'AURA',
    init(scene: THREE.Scene, quality: RenderQuality) {
      parentScene = scene;
      const profile = QUALITY_PROFILES[quality];
      maxBolts = profile.maxLightningBolts;
      const geo = tracker.trackGeometry(new THREE.BufferGeometry());
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxBolts * 24 * 3), 3));
      const mat = tracker.trackMaterial(
        new THREE.LineBasicMaterial({ color: 0x66ddff, transparent: true, opacity: 0.92 }),
      );
      lines = new THREE.LineSegments(geo, mat);
      scene.add(lines);
    },
    update(
      frame: GestureFrame,
      stage: StageDimensions,
      video: VideoDimensions,
      geometryConfig: GeometryConfig,
      deltaMs: number,
    ) {
      if (!lines) return;
      const anchors: Array<{ x: number; y: number; z: number }> = [];

      // Pose torso + arms indices (11: L shoulder, 12: R shoulder, 13: L elbow, 14: R elbow, 15: L wrist, 16: R wrist, 23: L hip, 24: R hip)
      if (frame.pose && frame.pose.length >= 25) {
        const poseIndices = [15, 13, 11, 12, 14, 16, 24, 23, 11];
        for (const idx of poseIndices) {
          const pt = frame.pose[idx];
          if (pt) {
            anchors.push(videoNormalizedToStage(pt, video, stage, geometryConfig).ndc);
          }
        }
      }

      for (const h of frame.hands) {
        const handIndices = [0, 5, 8, 12, 17, 20];
        for (const idx of handIndices) {
          const pt = h.landmarks[idx];
          if (pt) {
            anchors.push(videoNormalizedToStage(pt, video, stage, geometryConfig).ndc);
          }
        }
      }

      let velocity = 0.25;
      if (anchors.length > 0) {
        const cx = anchors.reduce((s, p) => s + p.x, 0) / anchors.length;
        const cy = anchors.reduce((s, p) => s + p.y, 0) / anchors.length;
        if (prevAnchorCentroid) {
          velocity = Math.hypot(cx - prevAnchorCentroid.x, cy - prevAnchorCentroid.y) / Math.max(0.016, deltaMs / 1000);
        }
        prevAnchorCentroid = { x: cx, y: cy };
      } else {
        prevAnchorCentroid = null;
      }

      const auraState = atualizarAuraCorpo(anchors, frame.frameTimestamp, velocity, maxBolts);
      renderizarAura(lines, auraState);
    },
    render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
      renderer.render(scene, camera);
    },
    dispose() {
      if (lines && parentScene) {
        parentScene.remove(lines);
      }
      tracker.disposeAll();
      lines = null;
      parentScene = null;
      prevAnchorCentroid = null;
    },
  };
}
