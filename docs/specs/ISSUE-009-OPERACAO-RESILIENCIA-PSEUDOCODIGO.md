# REALITY BENDER — Issue #9: operação, recuperação, diagnóstico e qualidade

**Versão:** 1.0 · **Issue:** https://github.com/PedroIgorBarbosa/Reality-Bender/issues/9  
**Contrato superior:** `docs/REALITY_BENDER_ERS_v1.0.md` · **Dependências:** #3, #4, #5, #6, #7, #8.  
**RF:** RF-06, RF-09, RF-16, RF-21, RF-22, RF-23, RF-24, RF-25, RF-26.  
**RNF:** RNF-10, RNF-12, RNF-15, RNF-17, RNF-20.

## 1. Resultado verificável e fronteira

Transformar a implementação técnica em uma aplicação operável durante apresentação real: controlar modo pelo celular e PC, exibir indicadores legítimos de câmera/rede/rastreamento/GPU, oferecer calibração, tela cheia, diagnóstico e reconexão, e lidar com falhas sem travar ou disfarçar vídeo congelado.

**Invariantes:** estado é derivado do sistema verdadeiro; comandos móveis exigem autorização da #2; cada ação tem resultado/erro/feedback; conexão WebRTC preservada na troca de efeito; nenhum processo de reconexão cria peers concorrentes; recursos possuem dono e limpeza idempotente; métricas são reais e rotuladas; perder vídeo oculta efeitos ativos quando necessário.

## 2. Arquivos e responsabilidades previstas

```text
src/shared/contracts/operation-events.ts       # comando/ACK/revisão
src/shared/contracts/diagnostic-types.ts
src/client/operations/OperationController.ts   # orquestra estados
src/client/operations/RecoveryCoordinator.ts   # serializa recuperação
src/client/operations/CommandController.ts    # modos e permissões
src/client/operations/ResourceLedger.ts        # limpeza e ownership
src/client/operations/ErrorCatalog.ts          # erros, causa e ação
src/client/diagnostics/MetricsCollector.ts
src/client/diagnostics/RtcStatsReader.ts
src/client/components/StageDiagnostics.tsx
src/client/components/OperationStatus.tsx
src/client/components/RecoveryActions.tsx
src/client/components/CalibrationPanel.tsx      # integrar #5
src/client/routes/StagePage.tsx
src/client/routes/ControlPage.tsx
tests/unit/error-catalog.test.ts
tests/unit/operation-state.test.ts
tests/unit/metrics-collector.test.ts
tests/integration/command-authorization.test.ts
tests/integration/recovery.test.ts
tests/ui/operation-controls.test.tsx
```

Respeitar `AGENTS.md`: consultar subgrafo relevante por arquivo antes de editar e registrar relações reais no JSON após executar; não inventar resultado de teste.

## 3. Contratos de estados, erros e comandos

```pseudocode
ENUM OperationPhase =
    BOOTING | WAITING_SESSION | WAITING_PHONE | PAIRED
    | CAMERA_REQUESTING | RTC_NEGOTIATING | VIDEO_LIVE
    | TRACKING_READY | PRESENTING | INTERRUPTED
    | RECOVERING | DEGRADED | FATAL | CLOSED

ENUM ErrorCode =
    INVITE_INVALID | INVITE_EXPIRED | EMITTER_OCCUPIED
    | CAMERA_DENIED | CAMERA_NOT_FOUND | CAMERA_IN_USE
    | INSECURE_CONTEXT | SIGNALING_UNAVAILABLE
    | ICE_DISCONNECTED | ICE_FAILED | RTC_SDP_INVALID
    | NO_FRESH_VIDEO_FRAMES | MODEL_LOAD_FAILED
    | NO_HANDS | NO_BODY | CALIBRATION_INCOMPLETE
    | WEBGL_UNAVAILABLE | WEBGL_CONTEXT_LOST
    | FULLSCREEN_REJECTED | UNAUTHORIZED_COMMAND
    | UNKNOWN_RECOVERABLE | UNKNOWN_FATAL

TIPO OperationSnapshot:
    phase: OperationPhase
    sessionPhase: SessionPhase
    signalingState: ConnectionPhase
    capturePhase: CapturePhase
    peerPhase: PeerPhase
    hasFreshVideo: boolean
    trackingPhase: EffectTrackingPhase
    mode: EffectMode
    quality: RenderQuality
    webglState: AVAILABLE|LOST|UNAVAILABLE
    activeError: ErrorCode|null
    lastTransitionAt: monotonic_ms
FIM_TIPO

TIPO CommandRequest:
    commandId: UUID_CRIPTOGRAFICO
    sessionId: string
    kind: SET_MODE|SET_QUALITY|STOP_MEDIA|END_SESSION|RECALIBRATE
    payload: DTO_VALIDADO
    expectedRevision: inteiro>=0 quando necessário
FIM_TIPO

TIPO CommandResult:
    commandId, accepted:boolean, revision:inteiro,
    errorCode?:ErrorCode, appliedState?:OperationSnapshotSubset
FIM_TIPO
```

A autorização por papel de `SET_MODE` já existe na #2. Qualidade e calibração podem ser locais ao STAGE se tecnicamente não precisarem de comando móvel; caso sejam expostas no celular, roteá-las como comandos validados sem compartilhar acesso irrestrito ao navegador do PC.

## 4. Algoritmo O-01 — derivar estado a partir de fontes reais

```pseudocode
FUNÇÃO deriveOperationPhase(sources):
    SE shutdown: RETORNAR CLOSED
    SE erro fatal: RETORNAR FATAL
    SE !signaling.connected E sem sessão válida: RETORNAR WAITING_SESSION
    SE session sem CONTROL: RETORNAR WAITING_PHONE
    SE session pareada e camera não solicitada: RETORNAR PAIRED
    SE capture.permissionPending: RETORNAR CAMERA_REQUESTING
    SE peer ainda negocia: RETORNAR RTC_NEGOTIATING
    SE track remota terminou ou não há frames frescos > limite:
        RETORNAR INTERRUPTED
    SE vídeo fresco e WebGL indisponível:
        RETORNAR DEGRADED  // vídeo pode permanecer visível
    SE vídeo fresco e tracking modelos indisponíveis:
        RETORNAR DEGRADED
    SE vídeo fresco e calibração insuficiente:
        RETORNAR VIDEO_LIVE
    SE vídeo fresco e tracking calibrado e mode=NONE:
        RETORNAR TRACKING_READY
    SE vídeo fresco e plugin ativo com âncoras válidas:
        RETORNAR PRESENTING
    RETORNAR VIDEO_LIVE
FIM_FUNÇÃO

FUNÇÃO applyOperationTransition(previous,next,clock):
    VALIDAR transição admitida pelo estado dos subsistemas
    SE next != previous:
        publicar snapshot imutável com timestamp e causa
    FIM_SE
    NUNCA definir LIVE apenas porque Socket.IO conectou
FIM_FUNÇÃO
```

O modo selecionado (por exemplo PORTAL) não é prova de que o efeito esteja visível; `PRESENTING` requer entrada real suficiente.

## 5. Algoritmo O-02 — sincronizar comandos móveis e do PC

```pseudocode
FUNÇÃO enviarComando(command):
    VALIDAR role permitido na UI e no servidor
    VALIDAR payload estritamente por schema
    ATRIBUIR commandId único
    MARCAR controle em estado "Aplicando..." com timeout
    ENVIAR comando por Socket.IO com ack
    SE ACK.accepted:
        ATUALIZAR UI pelo estado confirmado do servidor
        MOSTRAR feedback de sucesso apenas após confirmar
    SENÃO:
        restaurar seleção anterior e mostrar erro específico
    FIM_SE
FIM_FUNÇÃO

QUANDO servidor receber SET_MODE:
    AUTORIZAR socket como STAGE ou CONTROL da sessão vigente
    VALIDAR kind=SET_MODE e payload.mode enum
    REJEITAR revisão antiga quando expectedRevision exigido
    VERIFICAR cache de commandId recente por sessão:
        se repetido, responder ACK original (idempotência)
    ATUALIZAR session.currentMode e revision <- revision+1 atomicamente
    EMITIR stage:set-mode + revision aos dois participantes
    RETORNAR ACK aceito com estado efetivamente gravado
FIM_QUANDO

QUANDO STAGE receber stage:set-mode confirmado:
    VALIDAR revision >= revisionAplicada
    SE revision antiga: ignorar
    DESATIVAR plugin anterior somente se necessário
    ATIVAR plugin novo; se WebGL falhar informar visual indisponível
    NÃO fechar getUserMedia/RTCPeerConnection/MediaPipe
    ATUALIZAR controles do STAGE e CONTROL em sincronia
FIM_QUANDO
```

Dois comandos concorrentes são serializados pelo servidor; vence a maior `revision` confirmada, não a ordem de chegada dos pacotes no navegador.

## 6. Algoritmo O-03 — atalhos e interface de palco

```pseudocode
COMPONENTE StageControls():
    EXIBIR seleção NONE/ENERGY/PORTAL/AURA, qualidade, mirror, calibração
    EXIBIR tela cheia, diagnósticos, encerrar sessão
    QUANDO tecla digitada:
        SE foco em input/textarea/modal: ignorar
        0->NONE;1->ENERGY;2->PORTAL;3->AURA
        F->toggleFullscreen em ação direta do usuário
        D->toggleDiagnostics
    FIM
    DESABILITAR ações apenas quando realmente impossível,
        mostrando a causa e ação aplicável

    SE presenterFullscreen=true:
        esconder HUD operacional não crítico
        manter indicador discreto de perda de sinal, se houver
    FIM_SE
    NÃO bloquear vídeo com painel fixo de erro grande
FIM_COMPONENTE

COMPONENTE MobileControls():
    EXIBIR status do convite, câmera, sinalização, vídeo remoto e rastreamento
    EXIBIR prévia local real (quando permissão concedida)
    BOTOES "Iniciar câmera", "Parar transmissão", "Reconectar"
    BOTOES 0/1/2/3 para modo com feedback confirmado
    GARANTIR área de toque >=44x44 CSS pixels
    GARANTIR textos acessíveis, aria-live adequado
    PERMITIR rolagem vertical sem bloquear interação de toque
FIM_COMPONENTE
```

## 7. Algoritmo O-04 — catálogo de erro e política de recuperação

```pseudocode
FUNÇÃO resolverErro(code,context):
    SWITCH code:
        CAMERA_DENIED:
            mensagem="Permita câmera nas configurações do navegador"
            ação="Tentar novamente" apenas via clique explícito
            retryAutomatico=false
        CAMERA_IN_USE:
            mensagem="A câmera pode estar sendo usada por outro aplicativo"
            ação="Fechar outro app e tentar novamente"
            retryAutomatico=false
        INSECURE_CONTEXT:
            mensagem="Abra /control por endereço HTTPS confiável"
            ação="Abrir convite HTTPS válido"
        INVITE_EXPIRED:
            mensagem="Convite expirou"
            ação="Gerar novo QR no computador"
        EMITTER_OCCUPIED:
            mensagem="Já existe celular conectado"
            ação="Desconectar primeiro emissor ou aguardar liberação"
        ICE_FAILED:
            mensagem="Falha ao estabelecer transporte de vídeo"
            ação="Reconectar vídeo; verificar Wi-Fi/isolamento"
        NO_FRESH_VIDEO_FRAMES:
            mensagem="A câmera não está enviando novos quadros"
            ação="Reconectar a transmissão"
        MODEL_LOAD_FAILED:
            mensagem="Reconhecimento corporal indisponível"
            ação="Recarregar modelos sem interromper vídeo"
        NO_HANDS:
            mensagem="Vídeo ativo, mas nenhuma mão rastreada"
            ação="Enquadrar mãos; verificar iluminação"
        NO_BODY:
            mensagem="Corpo não rastreado"
            ação="Afastar-se para mostrar tronco e braços"
        WEBGL_UNAVAILABLE:
            mensagem="Efeitos indisponíveis neste navegador/GPU"
            ação="Usar navegador/GPU compatível; manter vídeo"
        WEBGL_CONTEXT_LOST:
            mensagem="Contexto gráfico interrompido"
            ação="Recriar renderizador e buffers, se possível"
        FULLSCREEN_REJECTED:
            mensagem="Tela cheia não autorizada"
            ação="Tentar pelo botão do navegador"
        PADRÃO:
            mostrar ação de recuperação mais segura ou encerrar limpa
    FIM_SWITCH
    RETORNAR {title,text,actionLabel,retryPolicy,severity}
FIM_FUNÇÃO
```

Nunca expor `SDP`, tokens, endereços privados de rede, vídeo ou stacks internos em mensagens de erro ao público.

## 8. Algoritmo O-05 — coordenar reconexão sem corrida

```pseudocode
FUNÇÃO RecoveryCoordinator.recover(reason):
    SE phase=RECOVERING:
        RETORNAR promiseDeRecuperacaoExistente
    FIM_SE
    SE phase=CLOSED: RETORNAR erro SESSION_CLOSED
    recoveryGeneration <- recoveryGeneration + 1
    MARCAR phase=RECOVERING
    abortController <- novo AbortController

    TENTAR:
        SE signaling desconectado:
            aguardar reconexão Socket.IO com timeout
            SE credencial antiga válida:
                session:resume com auth da #2
            SENÃO:
                instruir novo QR e NÃO recriar autorização implicitamente
            FIM_SE
        FIM_SE

        SE câmera local ended ou sem track:
            INSTRUIR usuário a clicar Iniciar câmera
            NÃO solicitar permissão automática repetitiva
            AGUARDAR intenção explícita
        FIM_SE

        SE track local viva:
            fechar peer de epoch antiga ou realizar ICE restart suportado
            solicitar nova epoch autorizada e renegociar conforme #3
        FIM_SE

        AGUARDAR primeiro quadro novo no PC dentro do prazo
        SE não chegou: FALHAR NO_FRESH_VIDEO_FRAMES
        REINICIAR inferência #5 com snapshot/epoch atual
        RECRIAR recursos WebGL somente se context lost
        RETORNAR READY quando fontes reais confirmarem
    CAPTURAR erro:
        MOSTRAR causa e ações sugeridas
        MANTER estado INTERRUPTED/DEGRADED sem alegar LIVE
    FINALMENTE:
        encerrar recuperação desta geração
        cancelar timers obsoletos
    FIM_TENTATIVA
FIM_FUNÇÃO

QUANDO ocorrer stop/close/unmount durante recover():
    abortController.abort()
    descartar callbacks e peers da recoveryGeneration anterior
    executar cleanup de idempotente, não reabrir câmera
FIM
```

Reconstituir conexão sem fechar ambas abas somente quando a sessão de autorização ainda for válida. Em caso de token expirado/revogado, exigir novo pareamento.

## 9. Algoritmo O-06 — vigiar quadros e estados em até 3 segundos

```pseudocode
FUNÇÃO verificarDisponibilidadeDeVideo():
    agora <- performance.now()
    SE pc.connectionState = failed/closed OU videoTrack.readyState != live:
        TRIGGER INTERRUPTED imediatamente
    SENÃO_SE lastVideoFrameAt conhecido E agora-lastVideoFrameAt > 3000ms:
        TRIGGER INTERRUPTED pelo NO_FRESH_VIDEO_FRAMES
    FIM_SE
    AO INTERRUPTED:
        cancelar/hide efeito ativo com fade apropriado
        remover status "Ao vivo"
        MOSTRAR banner "Sinal interrompido" sem falso último frame
        manter acesso ao botão de reconexão
    FIM
FIM_FUNÇÃO
```

Essa rotina depende do `MediaHealth` real da #3 e não pode inferir fluxo apenas de `iceConnectionState=connected`.

## 10. Algoritmo O-07 — instrumentação e qualidade das métricas

```pseudocode
TIPO DiagnosticSample:
    timestamp: monotonic_ms
    renderFps: real|null
    videoFps: real|null
    inferenceDurationMsP50: real|null
    inferenceDurationMsP95: real|null
    videoDimensions: {width,height}|null
    rtcConnectionState: string
    iceConnectionState: string
    trackingState: string
    effectMode: EffectMode
    quality: RenderQuality
    signalingRttMs: real|null
    physicalMotionToPhotonLatencyMs: "NOT_MEASURED"
FIM_TIPO

FUNÇÃO medirRenderFPS(rafTimestamps):
    AGRUPAR timestamps de RAF em janelas móveis de 1000ms
    RETORNAR número de frames concluídos por janela
    NÃO extrapolar 60fps se navegador estiver em background
FIM_FUNÇÃO

FUNÇÃO medirVideoFPS(frameCallbacks):
    CONTAR somente quadros novos apresentados via requestVideoFrameCallback
    SE browser não suportar medição confiável:
        RETORNAR null com status "Não mensurado"
FIM_FUNÇÃO

FUNÇÃO medirInferencia(amostras):
    coletar duração performance.now() antes/depois detectForVideo
    manter ring buffer limitado (ex. últimas 300 amostras)
    ordenar cópia para calcular percentis; não bloquear RAF
    mostrar p50/p95 com amostra e janela de tempo
FIM_FUNÇÃO

FUNÇÃO medirRede():
    ler getStats() por RTCPeerConnection para bitrate/packets
    calcular RTT de signaling por ping/ACK se necessário
    ROTULAR "RTT de sinalização"; não chamar de latência física
    NÃO inferir atraso mão→data-show de relógios JS não sincronizados
FIM_FUNÇÃO
```

Métricas aparecem no painel de diagnóstico, nunca se tornam uma telemetria remota com vídeo ou biometria. Limitar histórico em memória e limpar no encerramento.

## 11. Algoritmo O-08 — liberar recursos e detectar vazamento

```pseudocode
FUNÇÃO ResourceLedger.register(resource,owner,disposeFn):
    VALIDAR disposeFn executável
    ARMAZENAR {resource,owner,disposeFn,disposed:false}
FIM_FUNÇÃO

FUNÇÃO ResourceLedger.disposeOwner(owner):
    PARA entrada com owner:
        SE entrada.disposed: CONTINUAR
        MARCAR disposed=true ANTES de executar disposeFn
        TENTAR disposeFn(); CAPTURAR erro sanitizado e seguir demais
    FIM_PARA
    APAGAR referências ao owner
FIM_FUNÇÃO

FUNÇÃO fecharExperiencia():
    invalidar geração de operações e reconexões
    parar tracks locais e fechar peer RTC
    limpar video.srcObject local/remoto
    cancelar requestVideoFrameCallback, requestAnimationFrame e timers
    fechar detectores MediaPipe/worker quando não compartilhados
    desativar plugins, liberar geometry/material/textures/buffers
    remover listeners de eventos DOM/Socket.IO
    encerrar sessão via servidor autorizado e limpar tokens
    manter UI em CLOSED, sem reabrir recursos no cleanup
FIM_FUNÇÃO
```

O ledger também serve aos testes. Após aquecimento, executar 10 trocas de efeito e 3 reconexões; verificar contagem de objetos/handlers por proprietário retorna ao baseline. Métrica de memória do navegador é auxiliar e sujeita a GC, não prova isolada de vazamento.

## 12. Matriz de falhas e fluxo de recuperação

| Cenário | Estado visível | Ação | Teste de recuperação |
| --- | --- | --- | --- |
| QR vencido | Convite expirado | regenerar no STAGE | token antigo rejeitado; novo aceito |
| Outro celular conecta | Emissor ocupado | negar segundo, preservar primeiro | primeiro continua |
| Usuário nega câmera | Câmera bloqueada | instruir e tentar por clique | getUserMedia não auto-repetido |
| Câmera em uso | Câmera indisponível | fechar outro app | recuperação manual |
| Wi-Fi desligado | Sinal interrompido | retomar signaling/RTC | volta primeiro frame real |
| ICE failed | RTC falhou | nova epoch/negociação | peer antigo fechado |
| MediaPipe falha | Vídeo vivo, sem tracking | recarregar modelos | não falsifica pontos |
| Sem mão/pose | Rastreamento ausente | reposicionar usuário | efeitos fazem fade |
| WebGL2 ausente | Vídeo vivo, efeitos off | perfil/ambiente compatível | navegador não cai |
| Contexto GPU perdido | Gráficos interrompidos | restabelecer buffers | sem destruir RTC |
| Fullscreen negado | Palco em janela | botão manual/retentar | vídeo mantém proporção |
| Fechar browser | Conexão encerrada | nova sessão ou resume | recursos liberados |

## 13. Pseudocódigo dos testes

```pseudocode
SUITE CommandAuth:
    STAGE autorizado SET_MODE -> revision incrementa e ACK
    CONTROL autorizado SET_MODE -> STAGE/CONTROL sincronizam
    socket de outra sessão -> UNAUTHORIZED_COMMAND
    modo inválido -> rejeitar sem mutação
    commandId duplicado -> ACK idempotente, só uma mudança
    revisão antiga -> não sobrescrever nova
    10 trocas -> mesmo peer RTC e câmera ativa
FIM_SUITE

SUITE Recovery:
    signaling cai e volta -> retomar sessão válida
    credencial revogada -> exigir novo convite, não tentar invasão
    RTC ICE failed -> nova epoch, peer antigo disposed
    duas chamadas recover() simultâneas -> mesma promise de recuperação
    stop durante recover() -> abortar e fechar tudo
    câmera ended -> solicitar novo clique, não chamar getUserMedia sem gesto
    primeiro quadro não chega em timeout -> status INTERRUPTED
FIM_SUITE

SUITE Diagnostics:
    renderFPS calculado por janelas de 1s, com frames reais
    inference p50/p95 calculado só sobre amostras coletadas
    se sem requestVideoFrameCallback confiável -> videoFPS null
    RTT de signaling identificado como RTT e não latência física
    nenhum token/SDP/quadro é serializado em logs ou painel
FIM_SUITE

SUITE Resources:
    montar/desmontar Stage 10x -> listeners e RAF voltam ao baseline
    alternar 10x ENERGY/PORTAL/AURA/NONE -> sem renderer duplicado
    executar 3 ciclos de desconexão/reconexão -> peers anteriores fechados
    fechar experiência -> track.stop, worker.close, renderer.dispose
                         chamadas idempotentes
FIM_SUITE

SUITE UI:
    atalho 0,1,2,3 funciona sem input focado
    atalho F solicita fullscreen e trata rejeição
    atalho D mostra/esconde diagnóstico
    controles mobile usam área de toque apropriada
    mensagens distinguem rede vs câmera vs tracking vs GPU
    vídeo não é rotulado live quando quadro estagnado
FIM_SUITE

SUITE Física:
    Android+PC+data-show: operar 2 min cada efeito
    desligar Wi-Fi, reiniciar câmera, alternar 10 modos
    observar se status aparece em <=3s
    medir gráficos/CPU/FPS realmente com diagnóstico
    registrar hardware e resultados reais ou PENDENTE
FIM_SUITE
```

## 14. Critérios de aceite e negative prompt

**Pronto quando:** modos podem ser alternados pelo celular autorizado e pelo PC; indicadores refletem estados reais; erros comuns possuem ação recuperável; fullscreen, controles móveis, calibração e perfis gráficos funcionam; desligamento e reconexão são idempotentes; métricas reais e rotuladas; limpeza de recursos validada por contadores e testes. Atualizar grafo JSON de conhecimento.

**Não entregar:** botões sem ação, mensagens “Sucesso” antes de ACK, latência física calculada por ping/Date.now, vídeo congelado como “Ao vivo”, reconexão com dois peers ativos, logs com SDP/tokens/imagens, novos microserviços, banco de dados e métricas fabricadas.

**Handoff para #10:** operação e diagnóstico devem produzir os dados necessários à homologação dos 18 casos de teste e aos relatórios de hardware.
