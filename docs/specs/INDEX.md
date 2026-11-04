# REALITY BENDER — Índice das especificações de implementação

**Propósito:** roteiro de consulta por issue para o Codex, sem ler todo o projeto indiscriminadamente. Os documentos descrevem **como implementar**, mas não comprovam que a funcionalidade foi executada.

**Hierarquia de contratos:**
1. `AGENTS.md` rege o fluxo dos agentes e a memória obrigatória em `documentos de contexto/`.
2. `docs/REALITY_BENDER_ERS_v1.0.md` é o contrato de produto e requisitos.
3. Cada especificação `docs/specs/ISSUE-XXX-...` detalha algoritmos, contratos, testes e exceções da issue correspondente.
4. O código e testes efetivamente executados são a evidência de implementação; registros do grafo são memória auxiliar, não prova de funcionamento.

## Diretório de especificações

| Issue | Documento | Conteúdo | Depende de |
| --- | --- | --- | --- |
| [#1](https://github.com/PedroIgorBarbosa/Reality-Bender/issues/1) | [ISSUE-001-FUNDACAO-PSEUDOCODIGO.md](ISSUE-001-FUNDACAO-PSEUDOCODIGO.md) | Fundação executável (React, Node, Socket.IO, contratos, CI) | — |
| [#2](https://github.com/PedroIgorBarbosa/Reality-Bender/issues/2) | [ISSUE-002-SESSOES-PAREAMENTO-PSEUDOCODIGO.md](ISSUE-002-SESSOES-PAREAMENTO-PSEUDOCODIGO.md) | Sessões, QR Code, convites e papéis de autorização | #1 |
| [#3](https://github.com/PedroIgorBarbosa/Reality-Bender/issues/3) | [ISSUE-003-CAMERA-WEBRTC-PSEUDOCODIGO.md](ISSUE-003-CAMERA-WEBRTC-PSEUDOCODIGO.md) | Câmera móvel real, ICE/SDP e vídeo remoto | #2 |
| [#4](https://github.com/PedroIgorBarbosa/Reality-Bender/issues/4) | [ISSUE-004-PROJECAO-GEOMETRIA-PSEUDOCODIGO.md](ISSUE-004-PROJECAO-GEOMETRIA-PSEUDOCODIGO.md) | Projeção, viewport, espelhamento, qualidade e WebGL | #3 |
| [#5](https://github.com/PedroIgorBarbosa/Reality-Bender/issues/5) | [ISSUE-005-MEDIAPIPE-GESTOS-PSEUDOCODIGO.md](ISSUE-005-MEDIAPIPE-GESTOS-PSEUDOCODIGO.md) | Landmarks, gestos, estados e calibração | #4 |
| [#6](https://github.com/PedroIgorBarbosa/Reality-Bender/issues/6) | [ISSUE-006-ESFERA-ENERGIA-PSEUDOCODIGO.md](ISSUE-006-ESFERA-ENERGIA-PSEUDOCODIGO.md) | Esfera com shaders/partículas e duas palmas | #4, #5 |
| [#7](https://github.com/PedroIgorBarbosa/Reality-Bender/issues/7) | [ISSUE-007-PORTAL-DIMENSIONAL-PSEUDOCODIGO.md](ISSUE-007-PORTAL-DIMENSIONAL-PSEUDOCODIGO.md) | Portal ligado à mão aberta, orientação e abertura | #4, #5, #6 |
| [#8](https://github.com/PedroIgorBarbosa/Reality-Bender/issues/8) | [ISSUE-008-AURA-ELETRICA-PSEUDOCODIGO.md](ISSUE-008-AURA-ELETRICA-PSEUDOCODIGO.md) | Aura ligada ao tronco e braços independentes | #4, #5, #6 |
| [#9](https://github.com/PedroIgorBarbosa/Reality-Bender/issues/9) | [ISSUE-009-OPERACAO-RESILIENCIA-PSEUDOCODIGO.md](ISSUE-009-OPERACAO-RESILIENCIA-PSEUDOCODIGO.md) | Comandos, diagnósticos e recuperação | #3, #4, #5, #6, #7, #8 |
| [#10](https://github.com/PedroIgorBarbosa/Reality-Bender/issues/10) | [ISSUE-010-HOMOLOGACAO-PSEUDOCODIGO.md](ISSUE-010-HOMOLOGACAO-PSEUDOCODIGO.md) | CT-01–CT-18, HTTPS, FPS, latência física e runbook | #1, #2, #3, #4, #5, #6, #7, #8, #9 |

## Contratos compartilhados que não podem divergir

- **Sinalização:** eventos canônicos da ERS: `session:create`, `session:created`, `session:join`, `session:joined`, `rtc:offer`, `rtc:answer`, `rtc:ice-candidate`, `stage:set-mode`, `session:status`, `session:leave`. Cada mensagem RTC exige sessão, papel e `negotiationEpoch` autorizados.
- **Vídeo:** exclusivamente câmera real `getUserMedia({video:...,audio:false})` do celular → `RTCPeerConnection` → `/stage`; nunca fotos periódicas, vídeo pré-gravado ou base64 em Socket.IO. Transmissão não se confunde com status de conexão de sinalização.
- **Geometria:** `videoNormalizedToStage` da issue #4 é a única transformação 0–1 → coordenada CSS/NDC. Espelhamento, retrato/paisagem e aspect ratio passam por ela.
- **Tracking:** MediaPipe no PC sobre quadros remotos, no máximo duas mãos/uma pessoa; snapshot monotônico e sem fila crescente. Eventos de gesto com aquisição estável, `LOST_GRACE` e `FADING`.
- **Efeitos:** `EffectPlugin` de #6, compartilhado por ENERGY/PORTAL/AURA; um `WebGLRenderer`, um ciclo RAF, recursos de GPU registrados e liberados. Cada efeito usa parâmetros reais, não animações fixas.
- **Segurança:** controle por papel, convites criptográficos temporários, HTTPS/WSS confiável, nenhum segredo/sinal de câmera no grafo de contexto.
- **Qualidade:** sucesso de comando só após ACK, métricas reais rotuladas, não chamar RTT de latência mão→projeção, não marcar testes físicos como PASS se não executados.

## Processo recomendado ao receber uma issue

```pseudocode
FUNÇÃO executarIssue(issueNumero):
    CONSULTAR grafo: query --text "issue #" + issueNumero --depth 2 --format compact
    IDENTIFICAR documentos específicos do INDEX.md
    LER especificação correspondente, dependências diretas e ERS relevante
    CONFIRMAR estado atual do código e Git; grafo pode estar desatualizado
    IDENTIFICAR contratos compartilhados que a tarefa consome
    IMPLEMENTAR algoritmos e fluxos alternativos definidos
    EXECUTAR testes automatizados correspondentes e scripts de build
    REGISTRAR ações/arquivos/relações no grafo JSON conforme AGENTS.md
    PREPARAR PR com evidências reais e pendências explicitadas
FIM_FUNÇÃO
```

## Sequência de implementação e pontos de decisão

**Ordem mínima das dependências:** #1 → #2 → #3 → #4 → #5 → #6 → #7/#8 → #9 → #10. #7 e #8 podem ser implementadas em paralelo após #6, desde que não modifiquem de forma conflitante o mesmo renderer/registry.

**Marco de engenharia do primeiro dia:** câmera real → WebRTC → MediaPipe → esfera respondendo aos movimentos reais no data-show.

**Marco de engenharia do segundo dia:** portal + aura + recuperação + homologação. O prazo de dois dias é meta de execução, não garantia.

## Regras para interpretar testes e documentação

- Teste unitário ou integração isolada não comprova a demonstração física.
- Requisitos de FPS e latência são metas de engenharia, não valores medidos.
- A documentação de cada issue deve ser usada com os arquivos de código existentes; um documento não substitui implementação.
- Quando faltar hardware para um teste obrigatório, usar `NOT_RUN`/`BLOCKED`, nunca `PASS`.
- É proibido declarar conclusão sem observar os critérios P0 da ERS.

## Links principais

- [ERS — Requisitos e critérios de aceitação](../REALITY_BENDER_ERS_v1.0.md)
- [Instruções para agentes](../../AGENTS.md)
- [Estrutura do grafo de contexto](../../documentos%20de%20contexto/graph-record.schema.json)
- [Todas as issues no GitHub](https://github.com/PedroIgorBarbosa/Reality-Bender/issues)
