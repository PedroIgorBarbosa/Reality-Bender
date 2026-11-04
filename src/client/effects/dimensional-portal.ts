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

export interface PortalState {
  isOpen: boolean;
  center: { x: number; y: number; z: number };
  radiusX: number;
  radiusY: number;
  rotationAngle: number;
  pitchAngle: number;
  vortexSpeed: number;
  scale: number;
  openness: number;
}

export interface GestureCircleParams {
  handPath: ReadonlyArray<{ x: number; y: number; t: number }>;
  isCircleComplete: boolean;
  areaCoverage: number;
  center: { x: number; y: number };
  estimatedRadius: number;
}

export const INITIAL_PORTAL_STATE: PortalState = Object.freeze({
  isOpen: false,
  center: { x: 0, y: 0, z: 0 },
  radiusX: 0,
  radiusY: 0,
  rotationAngle: 0,
  pitchAngle: 0,
  vortexSpeed: 1.5,
  scale: 0,
  openness: 0,
});

export function detectarGestoCirculo(
  historicoPontos: ReadonlyArray<{ x: number; y: number; t: number }>,
): GestureCircleParams {
  if (historicoPontos.length < 8) {
    return {
      handPath: historicoPontos,
      isCircleComplete: false,
      areaCoverage: 0,
      center: { x: 0.5, y: 0.5 },
      estimatedRadius: 0,
    };
  }

  let cx = 0;
  let cy = 0;
  for (const pt of historicoPontos) {
    cx += pt.x;
    cy += pt.y;
  }
  cx /= historicoPontos.length;
  cy /= historicoPontos.length;

  const radii = historicoPontos.map((pt) => Math.hypot(pt.x - cx, pt.y - cy));
  const avgRadius = radii.reduce((a, b) => a + b, 0) / radii.length;
  if (avgRadius < 0.04) {
    return {
      handPath: historicoPontos,
      isCircleComplete: false,
      areaCoverage: 0,
      center: { x: cx, y: cy },
      estimatedRadius: avgRadius,
    };
  }

  let totalAngleSweep = 0;
  for (let i = 1; i < historicoPontos.length; i++) {
    const prev = historicoPontos[i - 1];
    const curr = historicoPontos[i];
    const a1 = Math.atan2(prev.y - cy, prev.x - cx);
    const a2 = Math.atan2(curr.y - cy, curr.x - cx);
    let delta = a2 - a1;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    totalAngleSweep += delta;
  }

  const sweepRatio = Math.min(1, Math.abs(totalAngleSweep) / (Math.PI * 1.65));
  const isCircleComplete = sweepRatio >= 0.85 && avgRadius >= 0.05;
  const areaCoverage = Math.PI * avgRadius * avgRadius;

  return {
    handPath: historicoPontos,
    isCircleComplete,
    areaCoverage,
    center: { x: cx, y: cy },
    estimatedRadius: avgRadius,
  };
}

export function abrirPortal(
  centro: { x: number; y: number; z?: number },
  raioInicial: number,
): PortalState {
  const r = Math.max(0.12, Math.min(0.85, raioInicial));
  return {
    isOpen: true,
    center: { x: centro.x, y: centro.y, z: centro.z ?? 0 },
    radiusX: r,
    radiusY: r * 1.15,
    rotationAngle: 0,
    pitchAngle: 0,
    vortexSpeed: 2.4,
    scale: 1.0,
    openness: 1.0,
  };
}

export function atualizarPortal(
  state: PortalState,
  input: {
    palmCenter?: { x: number; y: number; z: number } | null;
    palmOpenness?: number;
    orientationAngleRad?: number;
    pitchRad?: number;
    circleGesture?: GestureCircleParams;
    deltaMs: number;
  },
): PortalState {
  const dtSec = Math.max(0.001, Math.min(0.25, input.deltaMs / 1000));
  const openness = typeof input.palmOpenness === 'number' ? input.palmOpenness : 0;

  if (input.circleGesture?.isCircleComplete && !state.isOpen) {
    return abrirPortal(
      { x: input.circleGesture.center.x, y: input.circleGesture.center.y, z: 0 },
      input.circleGesture.estimatedRadius * 2.2,
    );
  }

  if (input.palmCenter && openness >= 0.25) {
    const targetScale = Math.min(1.35, Math.max(0.3, openness * 1.15));
    const scale = state.scale + (targetScale - state.scale) * Math.min(1, dtSec * 10);
    const baseR = 0.34 * scale;
    const pitch = input.pitchRad ?? state.pitchAngle;
    return {
      isOpen: true,
      center: {
        x: state.center.x + (input.palmCenter.x - state.center.x) * Math.min(1, dtSec * 12),
        y: state.center.y + (input.palmCenter.y - state.center.y) * Math.min(1, dtSec * 12),
        z: state.center.z + (input.palmCenter.z - state.center.z) * Math.min(1, dtSec * 12),
      },
      radiusX: baseR * Math.cos(pitch * 0.5),
      radiusY: baseR * 1.18,
      rotationAngle: (input.orientationAngleRad ?? state.rotationAngle) + dtSec * state.vortexSpeed,
      pitchAngle: pitch,
      vortexSpeed: 1.8 + openness * 2.2,
      scale,
      openness,
    };
  }

  // Smooth gradual closing when palm closes or hand leaves view
  const nextScale = Math.max(0, state.scale - dtSec * 1.8);
  return {
    ...state,
    isOpen: nextScale > 0.03,
    scale: nextScale,
    radiusX: state.radiusX * (nextScale / Math.max(0.001, state.scale || 1)),
    radiusY: state.radiusY * (nextScale / Math.max(0.001, state.scale || 1)),
    rotationAngle: state.rotationAngle + dtSec * state.vortexSpeed,
    openness: Math.max(0, openness),
  };
}

export async function fecharPortalGradual(
  state: PortalState,
  durationMs: number,
  steps = 5,
): Promise<PortalState> {
  let current = { ...state };
  const stepMs = Math.max(1, durationMs / Math.max(1, steps));
  for (let i = 0; i < steps; i++) {
    current = {
      ...current,
      scale: Math.max(0, current.scale * (1 - (i + 1) / steps)),
      openness: Math.max(0, current.openness * (1 - (i + 1) / steps)),
    };
    await new Promise((resolve) => setTimeout(resolve, Math.min(10, stepMs)));
  }
  return {
    ...current,
    isOpen: false,
    scale: 0,
    radiusX: 0,
    radiusY: 0,
    openness: 0,
  };
}

export function renderizarVortexPortal(target: unknown, state: PortalState): void {
  if (target && typeof target === 'object' && 'position' in target && 'rotation' in target && 'scale' in target) {
    const obj = target as THREE.Object3D;
    obj.visible = state.isOpen && state.scale > 0.02;
    obj.position.set(state.center.x, state.center.y, state.center.z);
    obj.rotation.set(state.pitchAngle, 0, state.rotationAngle);
    obj.scale.set(Math.max(0.01, state.radiusX), Math.max(0.01, state.radiusY), Math.max(0.01, state.scale));
  }
}

export function createDimensionalPortalPlugin(): EffectPlugin {
  const tracker = new GpuResourceTracker();
  let group: THREE.Group | null = null;
  let parentScene: THREE.Scene | null = null;
  let portalState: PortalState = { ...INITIAL_PORTAL_STATE };
  const indexTrail: Array<{ x: number; y: number; t: number }> = [];

  return {
    id: 'PORTAL',
    init(scene: THREE.Scene, quality: RenderQuality) {
      parentScene = scene;
      const profile = QUALITY_PROFILES[quality];
      group = new THREE.Group();

      const ringGeo = tracker.trackGeometry(new THREE.TorusGeometry(1, 0.08, 16, 64));
      const ringMat = tracker.trackMaterial(
        new THREE.ShaderMaterial({
          uniforms: {
            uTime: { value: 0 },
            uOpenness: { value: 1.0 },
          },
          vertexShader: `
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            varying vec2 vUv;
            uniform float uTime;
            void main() {
              float glow = 0.65 + 0.35 * sin(vUv.x * 24.0 + uTime * 8.0);
              gl_FragColor = vec4(1.0, 0.55 * glow, 0.12, 0.92);
            }
          `,
          transparent: true,
          blending: THREE.AdditiveBlending,
        }),
      );
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);

      const vortexGeo = tracker.trackGeometry(new THREE.RingGeometry(0.05, 0.96, 48));
      const vortexMat = tracker.trackMaterial(
        new THREE.MeshBasicMaterial({ color: 0xff8822, transparent: true, opacity: 0.42 }),
      );
      const vortexMesh = new THREE.Mesh(vortexGeo, vortexMat);

      const sparkCount = Math.max(96, Math.floor(profile.particleBudget / 4));
      const sparkPositions = new Float32Array(sparkCount * 3);
      for (let i = 0; i < sparkCount; i++) {
        const angle = (i / sparkCount) * Math.PI * 2;
        sparkPositions[i * 3] = Math.cos(angle) * (0.95 + (i % 5) * 0.03);
        sparkPositions[i * 3 + 1] = Math.sin(angle) * (0.95 + (i % 5) * 0.03);
        sparkPositions[i * 3 + 2] = ((i % 3) - 1) * 0.04;
      }
      const sparkGeo = tracker.trackGeometry(new THREE.BufferGeometry());
      sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
      const sparkMat = tracker.trackMaterial(
        new THREE.PointsMaterial({ color: 0xffbb44, size: 0.035, transparent: true }),
      );
      const sparks = new THREE.Points(sparkGeo, sparkMat);

      group.add(ringMesh, vortexMesh, sparks);
      scene.add(group);
    },
    update(
      frame: GestureFrame,
      stage: StageDimensions,
      video: VideoDimensions,
      geometryConfig: GeometryConfig,
      deltaMs: number,
    ) {
      if (!group) return;
      const primaryHand = frame.gestures[0];
      let palmCenter: { x: number; y: number; z: number } | null = null;
      if (primaryHand) {
        palmCenter = videoNormalizedToStage(primaryHand.centroid, video, stage, geometryConfig).ndc;
        const rawHand = frame.hands[0];
        if (rawHand && rawHand.landmarks[8]) {
          const tipNdc = videoNormalizedToStage(rawHand.landmarks[8], video, stage, geometryConfig).ndc;
          indexTrail.push({ x: tipNdc.x, y: tipNdc.y, t: frame.frameTimestamp });
          while (indexTrail.length > 24) indexTrail.shift();
        }
      }

      const circleGesture = detectarGestoCirculo(indexTrail);
      portalState = atualizarPortal(portalState, {
        palmCenter,
        palmOpenness: primaryHand?.palmOpenness ?? 0,
        orientationAngleRad: primaryHand?.orientation.angleRad,
        pitchRad: primaryHand?.orientation.pitchRad,
        circleGesture,
        deltaMs,
      });
      renderizarVortexPortal(group, portalState);
    },
    render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
      renderer.render(scene, camera);
    },
    dispose() {
      if (group && parentScene) {
        parentScene.remove(group);
      }
      tracker.disposeAll();
      group = null;
      parentScene = null;
      indexTrail.length = 0;
      portalState = { ...INITIAL_PORTAL_STATE };
    },
  };
}
