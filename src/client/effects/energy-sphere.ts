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

export interface EnergySphereState {
  active: boolean;
  position: { x: number; y: number; z: number };
  radius: number;
  intensity: number;
  color: { r: number; g: number; b: number };
  chargeLevel: number;
  stability: number;
}

export interface SphereControlParams {
  handDistance: number | null;
  midpoint: { x: number; y: number; z: number } | null;
  pinchStrength: number;
  velocity: { x: number; y: number; z: number };
  deltaMs: number;
  twoHandsVisible?: boolean;
}

export interface SphereRenderer {
  group: THREE.Group;
  coreMesh: THREE.Mesh;
  coronaPoints: THREE.Points;
  arcLines: THREE.LineSegments;
  tracker: GpuResourceTracker;
  state: EnergySphereState;
  dispose: () => void;
}

export const INITIAL_ENERGY_SPHERE_STATE: EnergySphereState = Object.freeze({
  active: false,
  position: { x: 0, y: 0, z: 0 },
  radius: 0.12,
  intensity: 0,
  color: { r: 0.18, g: 0.72, b: 1.0 },
  chargeLevel: 0,
  stability: 1.0,
});

export function calcularCargaEsfera(distanciaMaos: number, tempoAproximacaoMs: number): number {
  const clampedDist = Math.max(0.05, Math.min(0.85, distanciaMaos));
  const proximityFactor = 1.0 - Math.abs(clampedDist - 0.28) / 0.57;
  const timeFactor = Math.min(1.0, Math.max(0, tempoAproximacaoMs) / 1800);
  return Math.min(1.0, Math.max(0.05, proximityFactor * 0.55 + timeFactor * 0.45));
}

export function atualizarEstadoEsfera(
  estadoAtual: EnergySphereState,
  params: SphereControlParams,
): EnergySphereState {
  const dtSec = Math.max(0.001, Math.min(0.25, params.deltaMs / 1000));
  const lerpAlpha = Math.min(1, dtSec * 12);

  if (params.midpoint === null || params.handDistance === null) {
    // Graceful dissipation when hands leave camera field of view (Issue #6 CA-04)
    const nextCharge = Math.max(0, estadoAtual.chargeLevel - dtSec * 1.6);
    const nextIntensity = Math.max(0, estadoAtual.intensity - dtSec * 2.2);
    const nextRadius = Math.max(0.04, estadoAtual.radius * (1 - dtSec * 2.0));
    return {
      ...estadoAtual,
      active: nextIntensity > 0.02,
      radius: nextRadius,
      intensity: nextIntensity,
      chargeLevel: nextCharge,
      stability: Math.min(1, estadoAtual.stability + dtSec),
    };
  }

  const targetRadius = Math.min(0.75, Math.max(0.1, params.handDistance * 0.85));
  const radius = estadoAtual.radius + (targetRadius - estadoAtual.radius) * lerpAlpha;

  const pos = {
    x: estadoAtual.position.x + (params.midpoint.x - estadoAtual.position.x) * lerpAlpha,
    y: estadoAtual.position.y + (params.midpoint.y - estadoAtual.position.y) * lerpAlpha,
    z: estadoAtual.position.z + (params.midpoint.z - estadoAtual.position.z) * lerpAlpha,
  };

  const chargeIncrement = (params.twoHandsVisible ?? true) ? dtSec * 0.55 : dtSec * 0.25;
  const chargeLevel = Math.min(1, Math.max(0.15, estadoAtual.chargeLevel + chargeIncrement));
  const speed = Math.hypot(params.velocity.x, params.velocity.y, params.velocity.z);
  const stability = Math.max(0.25, Math.min(1.0, 1.0 - speed * 0.35));
  const intensity = Math.min(1.0, 0.35 + chargeLevel * 0.65);

  // Dynamic color shift from cyan-blue to electric violet-white as charge builds
  const color = {
    r: Math.min(1, 0.18 + chargeLevel * 0.65),
    g: Math.min(1, 0.68 + chargeLevel * 0.25),
    b: 1.0,
  };

  return {
    active: true,
    position: pos,
    radius,
    intensity,
    color,
    chargeLevel,
    stability,
  };
}

export function aplicarDistorcaoEspacial(
  mesh: THREE.Mesh,
  intensidade: number,
  timeSec = 0,
): void {
  const wobble = 1 + Math.sin(timeSec * 8.0) * 0.06 * Math.max(0, Math.min(1, intensidade));
  mesh.scale.set(wobble, 1 / wobble, wobble);
  const mat = mesh.material as THREE.ShaderMaterial;
  if (mat && mat.uniforms) {
    if (mat.uniforms.uIntensity) mat.uniforms.uIntensity.value = intensidade;
    if (mat.uniforms.uTime) mat.uniforms.uTime.value = timeSec;
  }
}

export function iniciarEsferaEnergia(quality: RenderQuality = 'HIGH'): SphereRenderer {
  const tracker = new GpuResourceTracker();
  const profile = QUALITY_PROFILES[quality];
  const group = new THREE.Group();

  const sphereGeo = tracker.trackGeometry(new THREE.SphereGeometry(1, 32, 32));
  const sphereMat = tracker.trackMaterial(
    new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uCharge: { value: 0 },
        uColor: { value: new THREE.Color(0.18, 0.72, 1.0) },
      },
      vertexShader: `
        varying vec3 vNormal;
        uniform float uTime;
        uniform float uIntensity;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec3 displaced = position * (1.0 + 0.05 * uIntensity * sin(uTime * 6.0 + position.y * 8.0));
          gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        uniform float uIntensity;
        uniform vec3 uColor;
        void main() {
          float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.0);
          gl_FragColor = vec4(uColor * (0.6 + fresnel * 0.8), uIntensity);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
    }),
  );
  const coreMesh = new THREE.Mesh(sphereGeo, sphereMat);

  const particleCount = Math.max(128, Math.floor(profile.particleBudget / 2));
  const positions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    const theta = (i / particleCount) * Math.PI * 2;
    const phi = Math.acos(2 * ((i * 0.6180339887) % 1) - 1);
    const r = 1.15 + (i % 7) * 0.04;
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  const coronaGeo = tracker.trackGeometry(new THREE.BufferGeometry());
  coronaGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const coronaMat = tracker.trackMaterial(
    new THREE.PointsMaterial({ color: 0x55ccff, size: 0.03, transparent: true, opacity: 0.85 }),
  );
  const coronaPoints = new THREE.Points(coronaGeo, coronaMat);

  const arcGeo = tracker.trackGeometry(new THREE.BufferGeometry());
  arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(48 * 3), 3));
  const arcMat = tracker.trackMaterial(new THREE.LineBasicMaterial({ color: 0xaaddff, transparent: true }));
  const arcLines = new THREE.LineSegments(arcGeo, arcMat);

  group.add(coreMesh, coronaPoints, arcLines);

  return {
    group,
    coreMesh,
    coronaPoints,
    arcLines,
    tracker,
    state: { ...INITIAL_ENERGY_SPHERE_STATE },
    dispose() {
      group.remove(coreMesh, coronaPoints, arcLines);
      tracker.disposeAll();
    },
  };
}

export function renderizarEsfera(
  sphereRenderer: SphereRenderer,
  estado: EnergySphereState,
  _viewMatrix?: THREE.Matrix4,
): void {
  sphereRenderer.state = estado;
  sphereRenderer.group.visible = estado.active && estado.intensity > 0.01;
  sphereRenderer.group.position.set(estado.position.x, estado.position.y, estado.position.z);
  sphereRenderer.group.scale.set(estado.radius, estado.radius, estado.radius);
  aplicarDistorcaoEspacial(sphereRenderer.coreMesh, estado.intensity, Date.now() / 1000);
}

export function createEnergySpherePlugin(): EffectPlugin {
  let sphere: SphereRenderer | null = null;
  let parentScene: THREE.Scene | null = null;
  let prevMidpoint: { x: number; y: number; z: number } | null = null;

  return {
    id: 'ENERGY',
    init(scene: THREE.Scene, quality: RenderQuality) {
      parentScene = scene;
      sphere = iniciarEsferaEnergia(quality);
      scene.add(sphere.group);
    },
    update(
      frame: GestureFrame,
      stage: StageDimensions,
      video: VideoDimensions,
      geometryConfig: GeometryConfig,
      deltaMs: number,
    ) {
      if (!sphere) return;
      let midpoint: { x: number; y: number; z: number } | null = null;
      let handDistance: number | null = null;
      let twoHandsVisible = false;

      if (frame.gestures.length >= 2) {
        twoHandsVisible = true;
        const p1 = videoNormalizedToStage(frame.gestures[0].centroid, video, stage, geometryConfig).ndc;
        const p2 = videoNormalizedToStage(frame.gestures[1].centroid, video, stage, geometryConfig).ndc;
        midpoint = {
          x: (p1.x + p2.x) / 2,
          y: (p1.y + p2.y) / 2,
          z: (p1.z + p2.z) / 2,
        };
        handDistance = Math.hypot(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z);
      } else if (frame.gestures.length === 1) {
        const g = frame.gestures[0];
        const p1 = videoNormalizedToStage(g.centroid, video, stage, geometryConfig).ndc;
        midpoint = p1;
        handDistance = Math.max(0.14, g.palmOpenness * 0.42);
      }

      const velocity =
        midpoint && prevMidpoint
          ? {
              x: (midpoint.x - prevMidpoint.x) / Math.max(0.016, deltaMs / 1000),
              y: (midpoint.y - prevMidpoint.y) / Math.max(0.016, deltaMs / 1000),
              z: (midpoint.z - prevMidpoint.z) / Math.max(0.016, deltaMs / 1000),
            }
          : { x: 0, y: 0, z: 0 };
      prevMidpoint = midpoint;

      const nextState = atualizarEstadoEsfera(sphere.state, {
        handDistance,
        midpoint,
        pinchStrength: frame.gestures[0]?.pinchDistance ?? 0.5,
        velocity,
        deltaMs,
        twoHandsVisible,
      });
      renderizarEsfera(sphere, nextState);
    },
    render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
      renderer.render(scene, camera);
    },
    dispose() {
      if (sphere && parentScene) {
        parentScene.remove(sphere.group);
      }
      sphere?.dispose();
      sphere = null;
      parentScene = null;
      prevMidpoint = null;
    },
  };
}
