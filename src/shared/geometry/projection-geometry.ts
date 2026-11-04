import type { EffectMode, RenderQuality } from '../contracts/system-events';

export interface VideoDimensions {
  widthPx: number;
  heightPx: number;
}

export interface StageDimensions {
  cssWidth: number;
  cssHeight: number;
  dpr: number;
}

export interface GeometryConfig {
  fit: 'contain' | 'cover';
  mirrored: boolean;
  orientationFromDecodedVideo: 'native' | 'explicit';
}

export interface ContentRect {
  left: number;
  top: number;
  width: number;
  height: number;
  scale: number;
}

export interface NormalizedPoint {
  x: number;
  y: number;
  z?: number;
}

export interface CssPoint {
  x: number;
  y: number;
}

export interface NdcPoint {
  x: number;
  y: number;
  z: number;
}

export interface QualityProfileSpec {
  readonly quality: RenderQuality;
  readonly renderScale: number;
  readonly particleBudget: number;
  readonly maxLightningBolts: number;
  readonly targetFps: number;
}

export const QUALITY_PROFILES: Record<RenderQuality, QualityProfileSpec> = Object.freeze({
  HIGH: Object.freeze({
    quality: 'HIGH',
    renderScale: 1.0,
    particleBudget: 4096,
    maxLightningBolts: 12,
    targetFps: 60,
  }),
  MEDIUM: Object.freeze({
    quality: 'MEDIUM',
    renderScale: 0.75,
    particleBudget: 2048,
    maxLightningBolts: 8,
    targetFps: 45,
  }),
  COMPAT: Object.freeze({
    quality: 'COMPAT',
    renderScale: 0.5,
    particleBudget: 512,
    maxLightningBolts: 4,
    targetFps: 30,
  }),
});

export const KEYBOARD_EFFECT_SHORTCUTS: Readonly<Record<string, EffectMode>> = Object.freeze({
  '0': 'NONE',
  '1': 'ENERGY',
  '2': 'PORTAL',
  '3': 'AURA',
});

function assertPositiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`Dimensão inválida para ${name}: ${value}`);
  }
}

export function computeContentRect(
  video: VideoDimensions,
  stage: StageDimensions,
  config: GeometryConfig,
): ContentRect {
  assertPositiveFinite(video.widthPx, 'video.widthPx');
  assertPositiveFinite(video.heightPx, 'video.heightPx');
  assertPositiveFinite(stage.cssWidth, 'stage.cssWidth');
  assertPositiveFinite(stage.cssHeight, 'stage.cssHeight');
  assertPositiveFinite(stage.dpr, 'stage.dpr');

  const scaleX = stage.cssWidth / video.widthPx;
  const scaleY = stage.cssHeight / video.heightPx;
  const scale = config.fit === 'cover' ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);

  const width = video.widthPx * scale;
  const height = video.heightPx * scale;
  const left = (stage.cssWidth - width) / 2;
  const top = (stage.cssHeight - height) / 2;

  return { left, top, width, height, scale };
}

/**
 * Canonical coordinate transformation (Issue #4):
 * Maps normalized video coordinates [0..1] into stage CSS pixels and Three.js NDC [-1..1].
 */
export function videoNormalizedToStage(
  point: NormalizedPoint,
  video: VideoDimensions,
  stage: StageDimensions,
  config: GeometryConfig,
): { css: CssPoint; ndc: NdcPoint; visible: boolean } {
  const rect = computeContentRect(video, stage, config);
  const clampedX = Math.min(1, Math.max(0, point.x));
  const clampedY = Math.min(1, Math.max(0, point.y));
  const normX = config.mirrored ? 1 - clampedX : clampedX;
  const normY = clampedY;

  const cssX = rect.left + normX * rect.width;
  const cssY = rect.top + normY * rect.height;

  const ndcX = (cssX / stage.cssWidth) * 2 - 1;
  const ndcY = -((cssY / stage.cssHeight) * 2 - 1);
  const ndcZ = typeof point.z === 'number' && Number.isFinite(point.z) ? Math.max(-1, Math.min(1, -point.z)) : 0;

  const visible =
    point.x >= 0 &&
    point.x <= 1 &&
    point.y >= 0 &&
    point.y <= 1 &&
    cssX >= 0 &&
    cssX <= stage.cssWidth &&
    cssY >= 0 &&
    cssY <= stage.cssHeight;

  return {
    css: { x: cssX, y: cssY },
    ndc: { x: ndcX, y: ndcY, z: ndcZ },
    visible,
  };
}

export function stageCssToNormalized(
  css: CssPoint,
  rect: ContentRect,
  mirrored: boolean,
): NormalizedPoint {
  if (rect.width <= 0 || rect.height <= 0) {
    throw new RangeError('ContentRect inválido');
  }
  const rawX = (css.x - rect.left) / rect.width;
  const rawY = (css.y - rect.top) / rect.height;
  const clampedX = Math.min(1, Math.max(0, rawX));
  const clampedY = Math.min(1, Math.max(0, rawY));
  return {
    x: mirrored ? 1 - clampedX : clampedX,
    y: clampedY,
    z: 0,
  };
}
