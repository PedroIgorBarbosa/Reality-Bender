export type TestStatus = 'NOT_RUN' | 'PASS' | 'FAIL' | 'BLOCKED';

export interface TestEvidence {
  id: string;
  requirementIds: string[];
  title: string;
  requiresPhysicalHardware: boolean;
  status: TestStatus;
  environment: string;
  executedAt: string | null;
  operator: string;
  commands: string[];
  observedResult: string;
  expectedResult: string;
  artifacts: string[];
  blockerReason: string | null;
  notes: string;
}

export function inicializarMatriz(): TestEvidence[] {
  const baseEnv = `Node ${process.version} (${process.platform}/${process.arch})`;
  return [
    {
      id: 'CT-010-1',
      requirementIds: ['RF-01', 'RF-02', 'RF-03', 'RF-06', 'RNF-08', 'RNF-09'],
      title: 'Isolamento de Sessão, Token de 128+ bits e Proteção contra Intrusão',
      requiresPhysicalHardware: false,
      status: 'NOT_RUN',
      environment: baseEnv,
      executedAt: null,
      operator: 'Gemini-Argon',
      commands: ['npm test'],
      observedResult: '',
      expectedResult: 'Tokens inválidos, expirados ou segundo celular concorrente são recusados sem desconectar o emissor ativo.',
      artifacts: ['tests/unit/session-manager.test.ts', 'tests/integration/socket.test.ts'],
      blockerReason: null,
      notes: '',
    },
    {
      id: 'CT-010-2',
      requirementIds: ['RF-04', 'RF-05', 'RF-08', 'RF-09', 'RNF-07'],
      title: 'Transporte WebRTC P2P, Fila de Candidatos ICE e Reconexão',
      requiresPhysicalHardware: false,
      status: 'NOT_RUN',
      environment: baseEnv,
      executedAt: null,
      operator: 'Gemini-Argon',
      commands: ['npm test'],
      observedResult: '',
      expectedResult: 'Oferta/Resposta SDP e candidatos ICE enfileirados antes de remoteDescription são aplicados na ordem correta; reconexão ICE restart opera sem fechar abas.',
      artifacts: ['tests/unit/webrtc-peer.test.ts'],
      blockerReason: null,
      notes: '',
    },
    {
      id: 'CT-010-3',
      requirementIds: ['RF-10', 'RF-11', 'RF-22', 'RF-23'],
      title: 'Mapeamento Geométrico Retrato/Paisagem e Espelhamento (videoNormalizedToStage)',
      requiresPhysicalHardware: false,
      status: 'NOT_RUN',
      environment: baseEnv,
      executedAt: null,
      operator: 'Gemini-Argon',
      commands: ['npm test'],
      observedResult: '',
      expectedResult: 'Transformação 0..1 -> CSS/NDC preserva letterbox/pillarbox em contain/cover e espelha eixo X corretamente.',
      artifacts: ['tests/unit/projection-geometry.test.ts'],
      blockerReason: null,
      notes: '',
    },
    {
      id: 'CT-010-4',
      requirementIds: ['RF-12', 'RF-14', 'RF-15', 'RF-16', 'RNF-04'],
      title: 'Fila de Inferência MediaPipe, Backpressure e Suavização OneEuroFilter',
      requiresPhysicalHardware: false,
      status: 'NOT_RUN',
      environment: baseEnv,
      executedAt: null,
      operator: 'Gemini-Argon',
      commands: ['npm test'],
      observedResult: '',
      expectedResult: 'Quadros concorrentes ou fora de ordem são descartados por backpressure sem acumular fila; gestos e calibração convergem deterministicamente.',
      artifacts: ['tests/unit/gesture-engine.test.ts'],
      blockerReason: null,
      notes: '',
    },
    {
      id: 'CT-010-5',
      requirementIds: ['RF-17', 'RF-18', 'RF-19', 'RF-20'],
      title: 'Reatividade e Fidelidade dos Efeitos 3D (Esfera, Portal e Aura Elétrica)',
      requiresPhysicalHardware: false,
      status: 'NOT_RUN',
      environment: baseEnv,
      executedAt: null,
      operator: 'Gemini-Argon',
      commands: ['npm test'],
      observedResult: '',
      expectedResult: 'Esfera responde à distância entre duas mãos, Portal responde à abertura/orientação/círculo e Aura gera raios procedurais ancorados à silhueta.',
      artifacts: ['tests/unit/effects-3d.test.ts'],
      blockerReason: null,
      notes: '',
    },
    {
      id: 'CT-010-6',
      requirementIds: ['RF-24', 'RF-25', 'RNF-15'],
      title: 'Detecção de Congelamento de Vídeo (< 3s) e Métricas de Diagnóstico P50/P95',
      requiresPhysicalHardware: false,
      status: 'NOT_RUN',
      environment: baseEnv,
      executedAt: null,
      operator: 'Gemini-Argon',
      commands: ['npm test'],
      observedResult: '',
      expectedResult: 'Ausência de quadros por >= 3000ms sinaliza congelamento; P50/P95 e FPS são calculados sem confundir RTT com latência física.',
      artifacts: ['tests/unit/diagnostics-resilience.test.ts'],
      blockerReason: null,
      notes: '',
    },
    {
      id: 'CT-010-7',
      requirementIds: ['RF-26', 'RNF-12', 'RNF-20'],
      title: 'Encerramento Limpo e Desalocação de Recursos (Tracks, Peers, Sockets e GPU)',
      requiresPhysicalHardware: false,
      status: 'NOT_RUN',
      environment: baseEnv,
      executedAt: null,
      operator: 'Gemini-Argon',
      commands: ['npm test'],
      observedResult: '',
      expectedResult: 'MediaStreamTrack.stop(), RTCPeerConnection.close() e BufferGeometry/Material.dispose() executam integralmente no teardown.',
      artifacts: ['tests/unit/effects-3d.test.ts', 'tests/unit/webrtc-peer.test.ts'],
      blockerReason: null,
      notes: '',
    },
    {
      id: 'CT-018-PHYSICAL',
      requirementIds: ['RF-04', 'RF-08', 'RF-10', 'RNF-01', 'RNF-02'],
      title: 'Homologação Física em Campo (Smartphone Real + Wi-Fi + Projetor/Data-Show)',
      requiresPhysicalHardware: true,
      status: 'NOT_RUN',
      environment: baseEnv,
      executedAt: null,
      operator: 'Gemini-Argon',
      commands: ['npm run https:setup', 'npm run build', 'npm start'],
      observedResult: '',
      expectedResult: 'Câmera física do celular transmitindo a >= 24 FPS para o projetor com latência mão-projeção medida em hardware.',
      artifacts: ['docs/OPERACAO_E_HOMOLOGACAO.md'],
      blockerReason: null,
      notes: '',
    },
  ];
}

export function registrarExecucao(
  matrix: readonly TestEvidence[],
  testId: string,
  observations: Partial<TestEvidence>,
): TestEvidence[] {
  return matrix.map((entry) => {
    if (entry.id !== testId) return entry;
    return {
      ...entry,
      ...observations,
      executedAt: observations.executedAt ?? new Date().toISOString(),
    };
  });
}

export function calcularEstatisticaFPS(samples: readonly number[]): {
  mean: number;
  min: number;
  max: number;
  p50: number;
} {
  const valid = samples.filter((n) => Number.isFinite(n) && n >= 0).sort((a, b) => a - b);
  if (valid.length === 0) {
    return { mean: 0, min: 0, max: 0, p50: 0 };
  }
  const sum = valid.reduce((a, b) => a + b, 0);
  const p50Idx = Math.min(valid.length - 1, Math.floor(valid.length * 0.5));
  return {
    mean: Math.round((sum / valid.length) * 100) / 100,
    min: valid[0],
    max: valid[valid.length - 1],
    p50: valid[p50Idx],
  };
}

export function calcularEstatisticaLatencia(samples: readonly number[]): {
  mean: number;
  p50: number;
  p95: number;
  max: number;
} {
  const valid = samples.filter((n) => Number.isFinite(n) && n >= 0).sort((a, b) => a - b);
  if (valid.length === 0) {
    return { mean: 0, p50: 0, p95: 0, max: 0 };
  }
  const sum = valid.reduce((a, b) => a + b, 0);
  const p50Idx = Math.min(valid.length - 1, Math.max(0, Math.ceil(valid.length * 0.5) - 1));
  const p95Idx = Math.min(valid.length - 1, Math.max(0, Math.ceil(valid.length * 0.95) - 1));
  return {
    mean: Math.round((sum / valid.length) * 100) / 100,
    p50: valid[p50Idx],
    p95: valid[p95Idx],
    max: valid[valid.length - 1],
  };
}

export function revisarRegressao(
  baseline: { p95Ms: number; minFps: number },
  current: { p95Ms: number; minFps: number },
): { passed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (current.p95Ms > baseline.p95Ms * 1.25) {
    reasons.push(`Latência P95 (${current.p95Ms}ms) excedeu o limite sobre o baseline (${baseline.p95Ms}ms)`);
  }
  if (current.minFps < baseline.minFps * 0.85) {
    reasons.push(`FPS mínimo (${current.minFps}) caiu abaixo do limite sobre o baseline (${baseline.minFps})`);
  }
  return {
    passed: reasons.length === 0,
    reasons,
  };
}
