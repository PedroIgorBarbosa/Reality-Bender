import { describe, expect, it } from 'vitest';
import {
  INITIAL_PORTAL_STATE,
  abrirPortal,
  atualizarPortal,
  createDimensionalPortalPlugin,
  detectarGestoCirculo,
  fecharPortalGradual,
} from '../../src/client/effects/dimensional-portal';
import { StageEffectsOrchestrator } from '../../src/client/effects/effect-plugin';
import {
  atualizarAuraCorpo,
  createElectricAuraPlugin,
  gerarRayosEletricos,
} from '../../src/client/effects/electric-aura';
import {
  INITIAL_ENERGY_SPHERE_STATE,
  atualizarEstadoEsfera,
  calcularCargaEsfera,
  createEnergySpherePlugin,
} from '../../src/client/effects/energy-sphere';

describe('3D Interactive Effects: Energy Sphere, Dimensional Portal & Electric Aura (Issues #6, #7, #8)', () => {
  it('Esfera de Energia (#6): expande com a distância entre as mãos, acumula carga e dissipa ao perder mãos', () => {
    const charge = calcularCargaEsfera(0.3, 1200);
    expect(charge).toBeGreaterThan(0.5);

    const activeState = atualizarEstadoEsfera(INITIAL_ENERGY_SPHERE_STATE, {
      handDistance: 0.45,
      midpoint: { x: 0.1, y: 0.2, z: 0 },
      pinchStrength: 0.8,
      velocity: { x: 0, y: 0, z: 0 },
      deltaMs: 100,
      twoHandsVisible: true,
    });
    expect(activeState.active).toBe(true);
    expect(activeState.radius).toBeGreaterThan(INITIAL_ENERGY_SPHERE_STATE.radius);
    expect(activeState.chargeLevel).toBeGreaterThan(0);

    // Hands leave field of view -> dissipates
    let dissipating = activeState;
    for (let i = 0; i < 15; i++) {
      dissipating = atualizarEstadoEsfera(dissipating, {
        handDistance: null,
        midpoint: null,
        pinchStrength: 0,
        velocity: { x: 0, y: 0, z: 0 },
        deltaMs: 100,
      });
    }
    expect(dissipating.active).toBe(false);
    expect(dissipating.intensity).toBe(0);
  });

  it('Portal Dimensional (#7): detecta trajetória circular, responde à abertura/orientação da palma e fecha gradualmente', async () => {
    const circlePts = Array.from({ length: 16 }, (_, i) => {
      const angle = (i / 15) * Math.PI * 2;
      return {
        x: 0.5 + Math.cos(angle) * 0.15,
        y: 0.5 + Math.sin(angle) * 0.15,
        t: i * 30,
      };
    });
    const circleResult = detectarGestoCirculo(circlePts);
    expect(circleResult.isCircleComplete).toBe(true);
    expect(circleResult.estimatedRadius).toBeCloseTo(0.15, 2);

    const opened = abrirPortal({ x: 0, y: 0, z: 0 }, 0.35);
    expect(opened.isOpen).toBe(true);

    const updated = atualizarPortal(INITIAL_PORTAL_STATE, {
      palmCenter: { x: 0.2, y: -0.1, z: 0 },
      palmOpenness: 0.9,
      orientationAngleRad: 0.5,
      pitchRad: 0.2,
      deltaMs: 100,
    });
    expect(updated.isOpen).toBe(true);
    expect(updated.scale).toBeGreaterThan(0.2);

    const closed = await fecharPortalGradual(updated, 20, 4);
    expect(closed.isOpen).toBe(false);
    expect(closed.scale).toBe(0);
  });

  it('Aura Elétrica (#8): gera raios fractais com ramificações e ancora ao tronco e braços', () => {
    const bolt = gerarRayosEletricos({ x: -0.3, y: 0.2, z: 0 }, { x: 0.3, y: 0.2, z: 0 }, 3, 42);
    expect(bolt.segments.length).toBeGreaterThan(5);
    expect(bolt.amplitude).toBeGreaterThan(0.01);

    const silhouette = [
      { x: -0.4, y: -0.2, z: 0 },
      { x: -0.2, y: 0.3, z: 0 },
      { x: 0.2, y: 0.3, z: 0 },
      { x: 0.4, y: -0.2, z: 0 },
    ];
    const aura = atualizarAuraCorpo(silhouette, 1000, 1.1, 8);
    expect(aura.active).toBe(true);
    expect(aura.boltCount).toBe(3);
    expect(aura.intensity).toBeGreaterThan(0.6);
  });

  it('StageEffectsOrchestrator alterna plugins e libera recursos de GPU no dispose (CT-010-7)', () => {
    const orchestrator = new StageEffectsOrchestrator();
    orchestrator.registerPlugin(createEnergySpherePlugin());
    orchestrator.registerPlugin(createDimensionalPortalPlugin());
    orchestrator.registerPlugin(createElectricAuraPlugin());

    const dummyFrame = {
      frameTimestamp: 1000,
      hands: [],
      pose: [
        ...Array.from({ length: 25 }, (_, i) => ({ x: 0.2 + i * 0.02, y: 0.5, z: 0 })),
      ],
      gestures: [
        {
          hand: 'Right' as const,
          gesture: 'OPEN_PALM' as const,
          confidence: 0.95,
          pinchDistance: 0.8,
          palmOpenness: 0.9,
          orientation: { angleRad: 0.3, pitchRad: 0.1, dirX: 0, dirY: -1, dirZ: 0 },
          centroid: { x: 0.35, y: 0.5, z: 0 },
        },
        {
          hand: 'Left' as const,
          gesture: 'OPEN_PALM' as const,
          confidence: 0.95,
          pinchDistance: 0.8,
          palmOpenness: 0.9,
          orientation: { angleRad: -0.3, pitchRad: 0.1, dirX: 0, dirY: -1, dirZ: 0 },
          centroid: { x: 0.65, y: 0.5, z: 0 },
        },
      ],
      handCount: 2,
    };

    const stage = { cssWidth: 1280, cssHeight: 720, dpr: 1 };
    const video = { widthPx: 1280, heightPx: 720 };
    const geo = { fit: 'contain' as const, mirrored: true, orientationFromDecodedVideo: 'native' as const };

    orchestrator.setMode('ENERGY', 'HIGH');
    expect(orchestrator.getActiveMode()).toBe('ENERGY');
    orchestrator.step(dummyFrame, stage, video, geo, 16);

    orchestrator.setMode('PORTAL', 'MEDIUM');
    expect(orchestrator.getActiveMode()).toBe('PORTAL');
    orchestrator.step(dummyFrame, stage, video, geo, 16);

    orchestrator.setMode('AURA', 'COMPAT');
    expect(orchestrator.getActiveMode()).toBe('AURA');
    orchestrator.step(dummyFrame, stage, video, geo, 16);

    orchestrator.dispose();
  });
});
