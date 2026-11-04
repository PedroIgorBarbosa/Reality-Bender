# Reality Bender

Sistema web interativo em tempo real para apresentações ao vivo que transmite o vídeo da câmera de um smartphone (`/control`) via WebRTC P2P até o navegador de palco/projetor (`/stage`), executa rastreamento de mãos e pose corporal (MediaPipe Hands & Pose) e renderiza três efeitos visuais 3D interativos em WebGL2/Three.js:

- **Esfera de Energia (`ENERGY`)**: controlada pela distância e aproximação entre as duas mãos, com acúmulo progressivo de carga, núcleo luminoso, partículas orbitais e arcos elétricos.
- **Portal Dimensional (`PORTAL`)**: ancorado na palma aberta ou ativado por gesto circular do indicador, rotacionando em 3D conforme a orientação da mão e escalando com a abertura da palma.
- **Aura Elétrica (`AURA`)**: descargas elétricas fractais procedurais ancoradas ao tronco, ombros, cotovelos, punhos e mãos, moduladas pela velocidade de movimento corporal.

## Arquitetura do Projeto

```text
src/
├── client/
│   ├── components/       # AppErrorBoundary, ConnectionStatus, DiagnosticsHud
│   ├── effects/          # EffectPlugin, EnergySphere (#6), DimensionalPortal (#7), ElectricAura (#8)
│   ├── hooks/            # useSystemConnection (handshake Socket.IO + medição RTT)
│   ├── realtime/         # createSystemClient, WebRtcPeerController (#3, #9)
│   ├── routes/           # StagePage (/stage), ControlPage (/control), NotFoundPage
│   ├── services/         # CameraCaptureService (getUserMedia, troca de câmera, HTTPS check)
│   └── tracking/         # MediaPipe Hands/Pose tracker com controle de backpressure (#5)
├── server/
│   ├── config/           # parseServerConfig & ConfigurationError (#1)
│   ├── realtime/         # SessionManager (#2) & attachSystemSocket (Socket.IO signaling & ACK)
│   ├── routes/           # /api/health (#1)
│   ├── app.ts            # Aplicação HTTP Express + cabeçalhos de segurança + SPA estático
│   └── index.ts          # Inicialização e graceful shutdown
└── shared/
    ├── contracts/        # Eventos tipados Socket.IO, estados de sessão e comandos (#1-#9)
    ├── diagnostics/      # Cálculo de FPS, P50/P95 de inferência e detecção de vídeo congelado (#9)
    ├── geometry/         # computeContentRect, videoNormalizedToStage, QUALITY_PROFILES (#4)
    ├── homologation/     # Matriz de homologação CT-010-1..CT-010-7 e regressão (#10)
    ├── pairing/          # Gerador QR Code SVG determinístico e parser de URL/PIN (#2)
    └── tracking/         # OneEuroFilter, CalibrationStateMachine e classificador de gestos (#5)
```

## Comandos Principais

```bash
# Instalar dependências inicialmente (o pacote ainda não inclui lockfile)
npm install

# Validar tipos TypeScript e imports
npm run typecheck

# Executar lint estático
npm run lint

# Executar suíte completa de testes (unitários, integração, UI e grafo de contexto)
npm test

# Compilar build de produção (dist/client e dist/server)
npm run build

# Executar smoke test automatizado do servidor de produção
npm run smoke:server

# Gerar instruções de HTTPS para celular e relatório de homologação
npm run https:setup
npm run homologate

# Iniciar em desenvolvimento ou produção
npm run dev
npm start
```

Consulte [`docs/OPERACAO_E_HOMOLOGACAO.md`](docs/OPERACAO_E_HOMOLOGACAO.md) e [`docs/REALITY_BENDER_ERS_v1.0.md`](docs/REALITY_BENDER_ERS_v1.0.md) para o roteiro completo de operação no celular e no computador.

## Memória de contexto em grafo

O diretório `documentos de contexto/registros/` guarda arquivos JSON **imutáveis**, um por ação. Cada registro indica quais arquivos foram alterados e como se relacionam com outros arquivos. A consulta reconstrói nós de ações (`action:<id>`), nós de arquivos (`file:<caminho>`) e relações direcionadas, sem dependências ou banco de dados externo.

Requer Node.js 20 ou superior. Exemplos:

```bash
# Consulta por tema ou arquivo; retorna só a vizinhança do grafo
node scripts/context-graph.mjs query --text "WebRTC" --depth 2 --limit 30
node scripts/context-graph.mjs query --file "AGENTS.md" --depth 2 --format compact

# Histórico auditável de um arquivo
node scripts/context-graph.mjs history --file "AGENTS.md"

# Verificação estrutural dos registros
node scripts/context-graph.mjs validate

# Testes da ferramenta de memória
node --test tests/context-graph.test.mjs

# Ajuda para registrar uma alteração
node scripts/context-graph.mjs help
```

Os comandos, as regras de preenchimento e o fluxo obrigatório antes/depois de cada tarefa estão no `AGENTS.md`. A ausência de um item no grafo não prova ausência de código; confira os arquivos reais e o Git. Os registros documentam trabalho, mas não substituem os testes da aplicação.

## Licença

Não definida. A ausência de arquivo LICENSE não concede automaticamente permissão para reutilização do código.
