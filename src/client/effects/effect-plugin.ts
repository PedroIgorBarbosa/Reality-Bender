import * as THREE from 'three';
import type { EffectMode, RenderQuality } from '../../shared/contracts/system-events';
import type { GeometryConfig, StageDimensions, VideoDimensions } from '../../shared/geometry/projection-geometry';
import type { GestureFrame } from '../../shared/tracking/gesture-engine';

export interface EffectPlugin {
  readonly id: EffectMode;
  init(scene: THREE.Scene, quality: RenderQuality): void;
  update(
    frame: GestureFrame,
    stage: StageDimensions,
    video: VideoDimensions,
    geometryConfig: GeometryConfig,
    deltaMs: number,
  ): void;
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): void;
  dispose(): void;
}

export class GpuResourceTracker {
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();

  public trackGeometry<T extends THREE.BufferGeometry>(geo: T): T {
    this.geometries.add(geo);
    return geo;
  }

  public trackMaterial<T extends THREE.Material>(mat: T): T {
    this.materials.add(mat);
    return mat;
  }

  public disposeAll(): { disposedGeometries: number; disposedMaterials: number } {
    let disposedGeometries = 0;
    let disposedMaterials = 0;
    for (const geo of this.geometries) {
      geo.dispose();
      disposedGeometries += 1;
    }
    for (const mat of this.materials) {
      mat.dispose();
      disposedMaterials += 1;
    }
    this.geometries.clear();
    this.materials.clear();
    return { disposedGeometries, disposedMaterials };
  }
}

export class StageEffectsOrchestrator {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 100);
  private readonly plugins = new Map<EffectMode, EffectPlugin>();
  private activeMode: EffectMode = 'NONE';
  private activeQuality: RenderQuality = 'HIGH';
  private renderer: THREE.WebGLRenderer | null = null;
  private disposed = false;

  constructor(canvas?: HTMLCanvasElement, renderer?: THREE.WebGLRenderer) {
    this.camera.position.set(0, 0, 2.2);
    this.renderer = renderer ?? new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  }

  public registerPlugin(plugin: EffectPlugin): void {
    this.plugins.set(plugin.id, plugin);
  }

  public setMode(mode: EffectMode, quality: RenderQuality = this.activeQuality): void {
    if (this.disposed) return;
    if (this.activeMode !== mode) {
      const current = this.plugins.get(this.activeMode);
      current?.dispose();
      this.activeMode = mode;
      this.activeQuality = quality;
      const next = this.plugins.get(mode);
      next?.init(this.scene, quality);
    } else if (this.activeQuality !== quality) {
      this.activeQuality = quality;
      const active = this.plugins.get(this.activeMode);
      active?.dispose();
      active?.init(this.scene, quality);
    }
  }

  public getActiveMode(): EffectMode {
    return this.activeMode;
  }

  public step(
    frame: GestureFrame,
    stage: StageDimensions,
    video: VideoDimensions,
    geometryConfig: GeometryConfig,
    deltaMs: number,
  ): void {
    if (this.disposed || !this.renderer) return;
    const plugin = this.plugins.get(this.activeMode);
    if (plugin) {
      plugin.update(frame, stage, video, geometryConfig, deltaMs);
      plugin.render(this.renderer, this.scene, this.camera);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const plugin of this.plugins.values()) {
      plugin.dispose();
    }
    this.plugins.clear();
    this.renderer?.dispose();
    this.renderer = null;
  }
}
