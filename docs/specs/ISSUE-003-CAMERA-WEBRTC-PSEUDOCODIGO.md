# REALITY BENDER — Issue #3: câmera real e WebRTC ponta a ponta

**Versão:** 1.0 · **Issue:** https://github.com/PedroIgorBarbosa/Reality-Bender/issues/3  
**Contrato superior:** \`docs/REALITY_BENDER_ERS_v1.0.md\` · **Depende de:** #1, #2  
**RF:** RF-04, RF-05, RF-06, RF-08, RF-09, RF-10 · **RNF:** RNF-03, RNF-07, RNF-08, RNF-13.

## 1. Entrega observável e limites

O celular, pareado por convite da #2, obtém vídeo da **câmera física somente após interação** e transmite uma \`MediaStreamTrack\` de vídeo por \`RTCPeerConnection\` ao PC. O PC exibe o vídeo real na rota \`/stage\`. Sem MediaPipe, efeitos ou áudio nesta issue. Uma alteração inesperada no campo de visão deve aparecer no PC.

**Invariantes:** (I1) nunca solicitar microfone; (I2) nenhum frame por Socket.IO/upload/base64; (I3) a sessão autoriza toda oferta/resposta/ICE; (I4) somente uma conexão RTC ativa por par/época; (I5) sem primeiro frame não dizer “Ao vivo”; (I6) encerramento interrompe tracks físicas; (I7) comunicação no celular sob HTTPS confiável; (I8) vídeo desconectado não fica exibido como live.

## 2. Componentes e arquivos previstos

\`\`\`text
src/client/camera/capture-constraints.ts       # presets e fallback
src/client/camera/capture-controller.ts        # permissão/stream/track/cleanup
src/client/rtc/peer-config.ts                  # config ICE sem segredos
src/client/rtc/rtc-controller.ts               # estado, epoch, negociación
src/client/rtc/candidate-buffer.ts             # trickle ICE antes de remoteDescription
src/client/rtc/media-health.ts                 # vida dos quadros e estado real
src/client/components/LocalCameraPreview.tsx  # prévia celular
src/client/components/RemoteLiveVideo.tsx     # vídeo PC + overlay estado
src/client/routes/ControlPage.tsx             # ações iniciar/parar/reconectar
src/client/routes/StagePage.tsx               # vídeo real de chegada
tests/unit/capture-constraints.test.ts
tests/unit/candidate-buffer.test.ts
tests/unit/rtc-state.test.ts
tests/integration/rtc-signaling.test.ts
tests/ui/camera-permission.test.tsx
\`\`\`

Modificar handlers de #2 apenas para integrar nova negociação e transições de mídia verificadas. Não mudar papéis, contratos canônicos nem expiração de convite.

## 3. Tipos e contratos de controle

\`\`\`pseudocode
ENUM CapturePhase =
    IDLE | REQUESTING_PERMISSION | CAPTURING | STOPPED | DENIED | NOT_FOUND
    | IN_USE | SECURITY_ERROR | UNKNOWN_ERROR

ENUM PeerPhase =
    IDLE | PREPARING | OFFERING | ANSWERING | CHECKING_ICE
    | CONNECTED | RECEIVING_FRAMES | INTERRUPTED | RECONNECTING
    | FAILED | CLOSED

TIPO RtcEnvelope:
    negotiationEpoch: inteiro não negativo
    requestId: string curta aleatória
    description: {type:"offer"|"answer", sdp:string} OU
    candidate: {candidate:string, sdpMid:string|null,
                sdpMLineIndex:integer|null, usernameFragment?:string}
FIM_TIPO

TIPO MediaHealth:
    videoWidth: inteiro >= 0
    videoHeight: inteiro >= 0
    hasLiveVideoTrack: booleano
    lastFrameArrivalAt: monotonic_ms|null
    firstFrameObserved: booleano
    iceState: "new"|"checking"|"connected"|"completed"|
              "disconnected"|"failed"|"closed"
    connectionState: WebRTCConnectionState
FIM_TIPO

TIPO CameraResult:
    stream: MediaStream
    activeTrack: MediaStreamTrack(kind="video")
    width/height/fps: valores observados por track.getSettings()
FIM_TIPO
\`\`\`

O servidor não recebe stream: apenas \`rtc:offer\`, \`rtc:answer\` e \`rtc:ice-candidate\` validados pela #2.

## 4. Algoritmo C-01 — inicialização segura do controle móvel

\`\`\`pseudocode
COMPONENTE ControlPage():
    session <- sessaoPareadaDaIssue2()
    capture <- NOVO CaptureController()
    peer <- NOVO RtcController(role=CONTROL)

    SE window.isSecureContext = false:
        DESABILITAR iniciar câmera
        MOSTRAR "Abra o convite em HTTPS confiável"
    FIM_SE
    SE navigator.mediaDevices.getUserMedia não existir:
        MOSTRAR "Este navegador não permite acesso à câmera"
    FIM_SE
    SE session.role != CONTROL OU session.phase não for PAIRED:
        DESABILITAR iniciar câmera
        MOSTRAR causa e ação de pareamento
    FIM_SE

    RENDERIZAR botão "Iniciar câmera" habilitado somente se pré-condições
    RENDERIZAR "Parar transmissão" somente quando captura/RTC ativo
    RENDERIZAR "Reconectar" se erro de mídia recuperável
    RENDERIZAR estado de captura SEPARADO do estado de RTC e sessão

    AO_TOCAR "Iniciar câmera":
        AGUARDAR iniciarCapturaETransmissao() // ação explícita
    FIM
FIM_COMPONENTE
\`\`\`

## 5. Algoritmo C-02 — pedir câmera física sem áudio

\`\`\`pseudocode
FUNÇÃO solicitarCameraFisica():
    SE captura em andamento ou permissionRequestInFlight:
        RETORNAR resultado já pendente; NÃO abrir outra permissão
    FIM_SE
    VALIDAR contexto HTTPS e navigator.mediaDevices
    ATUALIZAR estado para REQUESTING_PERMISSION

    constraintsIdeais = {
        audio: false,
        video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
            facingMode: { ideal: "user" }
        }
    }

    TENTAR:
        stream <- AGUARDAR getUserMedia(constraintsIdeais)
    CAPTURAR OverconstrainedError:
        stream <- AGUARDAR getUserMedia({
            audio: false,
            video: { width: {ideal:640}, height:{ideal:480},
                     frameRate:{ideal:30} }
        })
    CAPTURAR NotAllowedError:
        estado <- DENIED; MOSTRAR passo para liberar permissão; FALHAR
    CAPTURAR NotFoundError:
        estado <- NOT_FOUND; MOSTRAR "Nenhuma câmera disponível"; FALHAR
    CAPTURAR NotReadableError:
        estado <- IN_USE; MOSTRAR "Câmera ocupada por outro app"; FALHAR
    CAPTURAR SecurityError OU TypeError:
        estado <- SECURITY_ERROR; MOSTRAR HTTPS/permissões; FALHAR
    CAPTURAR erro genérico:
        estado <- UNKNOWN_ERROR; MOSTRAR erro recuperável; FALHAR
    FIM_TENTATIVA

    track <- ÚNICA track de vídeo de stream
    SE ausente OU track.readyState != "live":
        PARAR todas tracks e FALHAR "VIDEO_TRACK_UNAVAILABLE"
    FIM_SE
    GARANTIR stream.getAudioTracks().length = 0
    OUVIR track.onended -> encerrarTransmissao("CAMERA_ENDED")
    ATUALIZAR estado CAPTURING e resolução real por track.getSettings()
    RETORNAR stream
FIM_FUNÇÃO
\`\`\`

Os campos \`ideal\` são metas; não afirmar 720p/30fps apenas porque foram solicitados. A resolução real é a observada no track, não um valor fixo.

## 6. Algoritmo C-03 — prévia local verdadeira

\`\`\`pseudocode
COMPONENTE LocalCameraPreview(stream):
    videoRef <- referência ao elemento <video>
    AO_RECEBER stream:
        DEFINIR video.muted = true
        DEFINIR video.autoplay = true
        DEFINIR video.playsInline = true
        DEFINIR video.srcObject = stream
        CHAMAR video.play() somente quando necessário e tratar rejeição
        SE metadados não carregarem no prazo:
            MOSTRAR erro "Prévia não iniciou"; não declarar sucesso
    FIM
    SE track interrompida:
        REMOVER srcObject
        MOSTRAR "Câmera desligada"
    FIM
    AO_DESMONTAR:
        DESANEXAR srcObject sem parar stream que pertença a outro dono
    FIM
FIM_COMPONENTE
\`\`\`

A câmera é propriedade de \`CaptureController\`, não do elemento React: desmontar uma UI não deve encerrar tracks se o fluxo continua em outra página sem intenção de parada.

## 7. Algoritmo C-04 — criar par RTC com época e callbacks

\`\`\`pseudocode
FUNÇÃO criarPeerController(role, sessionAuthorization, epoch):
    VALIDAR role=CONTROL ou STAGE e vínculo de sessão atual
    VALIDAR epoch >= 0, compatível com server negotiationEpoch
    pc <- new RTCPeerConnection({
        iceServers: CONFIGURACAO_DOCUMENTADA_SE_EXISTIR,
        iceCandidatePoolSize: 0
    })
    SE STUN não configurado:
        documentar que conexão P2P na rede local depende de ICE host candidates
    FIM_SE
    NÃO incluir TURN fictício, credenciais fixas ou proxy de vídeo

    registro <- {pc, role, epoch, closed:false, offerInFlight:false,
                 pendingCandidates:[], cleanupFns:[]}

    pc.onicecandidate(evento):
        SE registro.closed ou epoch não for vigente: RETORNAR
        SE evento.candidate existir:
            ENVIAR rtc:ice-candidate por Socket.IO autorizado com epoch
        FIM_SE
    FIM

    pc.oniceconnectionstatechange():
        LER estado real
        SE "failed": emitir INTERRUPTED/FAILED e oferecer recuperação
        SE "disconnected": iniciar timer curto de grace (<=3s)
        SE "connected"/"completed": cancelar timer de grace
        NÃO declarar LIVE até primeiro quadro remoto decodificado
    FIM

    pc.onconnectionstatechange():
        MONITORAR falha/fechamento e desconectar do status da sessão
    FIM
    RETORNAR registro
FIM_FUNÇÃO
\`\`\`

## 8. Algoritmo C-05 — negociação: celular sempre inicia oferta

\`\`\`pseudocode
FUNÇÃO iniciarTransmissaoComoControl(stream, session):
    PRECONDICAO session.role=CONTROL e stream com videoTrack.live
    epoch <- AGUARDAR servidorAutorizarNovaNegociacao(session)
    ENCERRAR peer anterior e invalidar callbacks de época antiga
    registro <- criarPeerController(CONTROL, session, epoch)
    registro.pc.addTrack(stream.getVideoTracks()[0], stream)

    // Exclusão: apenas uma negociação por época.
    SE registro.offerInFlight = true: RETORNAR
    registro.offerInFlight = true
    TENTAR:
        oferta <- AGUARDAR registro.pc.createOffer()
        SE epoch mudou: RETORNAR SEM EMITIR
        AGUARDAR registro.pc.setLocalDescription(oferta)
        SE epoch mudou: RETORNAR SEM EMITIR
        EMITIR rtc:offer {
            negotiationEpoch:epoch,
            description:{type:"offer",sdp:localDescription.sdp}
        } e confirmar entrega por ACK
        estado <- OFFERING
    FINALMENTE:
        registro.offerInFlight = false
    FIM_TENTATIVA
FIM_FUNÇÃO
\`\`\`

O serviço de sessão da #2 deve adicionar a operação atômica de \`negotiationEpoch\` para impedir ofertas simultâneas/obsoletas; não criar eventos sem autorização.

## 9. Algoritmo C-06 — PC recebe oferta e responde

\`\`\`pseudocode
QUANDO STAGE receber rtc:offer(envelope):
    VALIDAR remetente CONTROL autorizado e epoch atual via servidor
    SERIALIZAR negociação por sessionId/epoch
    SE já existe resposta vigente ao mesmo requestId:
        responder de maneira idempotente; NÃO criar segunda conexão
    FIM_SE
    DESCARTAR peer de época anterior de modo controlado
    peer <- criarPeerController(STAGE, session, epoch)
    AGUARDAR peer.pc.setRemoteDescription({
        type:"offer", sdp:envelope.description.sdp
    })
    APLICAR candidatos pendentes desse epoch
    answer <- AGUARDAR peer.pc.createAnswer()
    AGUARDAR peer.pc.setLocalDescription(answer)
    SE epoch ainda vigente:
        ENVIAR rtc:answer {negotiationEpoch:epoch,
                           description:{type:"answer",
                                        sdp:pc.localDescription.sdp}}
    FIM_SE
FIM

QUANDO CONTROL receber rtc:answer(envelope):
    VALIDAR epoch=vigente E pc.signalingState = "have-local-offer"
    AGUARDAR pc.setRemoteDescription(answer)
    APLICAR candidatos pendentes somente do mesmo epoch
    ALTERAR status para CHECKING_ICE
FIM
\`\`\`

Se \`setRemoteDescription\` falhar, descartar recursos da época e mostrar código \`RTC_NEGOTIATION_FAILED\`; nunca permanecer indefinidamente em \`CONNECTING\`.

## 10. Algoritmo C-07 — Trickle ICE com buffering limitado

\`\`\`pseudocode
QUANDO receber rtc:ice-candidate(envelope):
    SE epoch não corresponde ao peer ativo: DESCARTAR
    VALIDAR candidato foi aceito pelo servidor/autorizado
    SE pc.remoteDescription != null:
        TENTAR AGUARDAR pc.addIceCandidate(candidate)
        EM_FALHA registrar código seguro "ICE_CANDIDATE_REJECTED"
    SENAO:
        SE quantidade pendente >= LIMITE_CONFIGURADO (ex. 128):
            ABORTAR peer com erro ICE_BUFFER_OVERFLOW
        SENAO:
            ADICIONAR candidato à fila desta época
        FIM_SE
    FIM_SE
FIM

FUNÇÃO drenarCandidatos(epoch):
    PARA cada candidato pendente da época, na ordem:
        SE epoch mudou ou peer fechado: ENCERRAR
        AGUARDAR pc.addIceCandidate(candidate)
    FIM
    ESVAZIAR fila e liberar referências
FIM_FUNÇÃO
\`\`\`

A ordem de chegada ICE vs SDP pode variar. A fila deve ser limitada, segregada por negociação e descartada ao trocar de época.

## 11. Algoritmo C-08 — vídeo remoto, detecção de primeiro quadro e vida

\`\`\`pseudocode
QUANDO STAGE.pc.ontrack(event):
    SE event.track.kind != "video": IGNORAR
    stream <- event.streams[0] SE presente
              SENÃO new MediaStream([event.track])
    ANEXAR stream ao elemento <video playsInline autoplay muted>
    DEFINIR stage.mediaHealth.firstFrameObserved=false

    INSTALAR monitor:
        quando video.requestVideoFrameCallback disponível:
            QUANDO frame novo efetivamente apresentado:
                lastFrameArrivalAt <- performance.now()
                firstFrameObserved <- true
                atualizar dimensões reais e FPS de quadros
                reagendar callback enquanto epoch atual
        SENÃO:
            usar eventos loadeddata/playing + observação periódica conservadora
            verificar readyState e track.readyState
            classificar FPS como não mensurado se método não confiável

    SE peer conectado E primeiro frame válido recebido:
        estado <- RECEIVING_FRAMES
        MOSTRAR "Vídeo ao vivo"
    FIM_SE
FIM

ROTINA verificarMediaSaudavel():
    SE track.readyState != "live" OU pc.connectionState em failed/closed:
        MOSTRAR "Sinal interrompido"
        OCULTAR/quebrar ligação visual com último frame, sem mentir "ao vivo"
    SENÃO_SE lastFrameArrivalAt existe E agora-lastFrameArrivalAt > 3000ms:
        MOSTRAR "Nenhum quadro recente"
        SUSPENDER indicador "Ao vivo"; preparar reconexão
    FIM_SE
FIM_ROTINA
\`\`\`

Não confundir o evento \`ontrack\` com comprovação de frames renderizados. A aferição de latência física só pertence à #10.

## 12. Algoritmo C-09 — parar, reconectar e fechar

\`\`\`pseudocode
FUNÇÃO pararTransmissao(reason):
    SE já parado: RETORNAR sucesso idempotente
    INVALIDAR epoch/generation locais e callbacks RTC assíncronos
    ENVIAR evento de parada autorizado ao STAGE quando possível
    PARAR todas videoTracks geridas por CaptureController
    FECHAR RTCPeerConnection
    REMOVER handlers de ontrack/onicecandidate/onconnectionstatechange
    CANCELAR timers de grace, ICE queue e frame monitor
    DEFINIR videoLocal.srcObject = null
    DEFINIR videoRemoto.srcObject = null no STAGE ao receber parada
    ATUALIZAR estados CAPTURING->STOPPED e RTC->CLOSED
    NÃO invalidar sessão de pareamento se intenção era apenas parar mídia
FIM_FUNÇÃO

FUNÇÃO reconectarWebRtc():
    VERIFICAR sessão ainda ativa e role autorizado
    SE tentativa de reconexão já em andamento: RETORNAR promise existente
    SE signaling indisponível:
        AGUARDAR restabelecimento / solicitar session:resume
    FIM_SE
    SE track local viva:
        TENTAR ICE restart quando suportado + nova negociação
        SE falha: fechar peer anterior e construir outro com novo epoch
    SENÃO:
        EXIGIR novo clique explícito para getUserMedia se câmera parou
    FIM_SE
    INVALIDAR todos envelopes e timers da época anterior
    RETORNAR estado observável (não apenas sucesso de Socket.IO)
FIM_FUNÇÃO

QUANDO track.onended OU pagehide OU encerrarSessao():
    ABORTAR operações pendentes, fechar pares e liberar camera de forma idempotente
    NÃO repetir automaticamente prompt de permissão após recusa
FIM
\`\`\`

## 13. Máquina de estados, concorrência e fluxos de falha

\`\`\`text
Celular: IDLE -> REQUESTING_PERMISSION -> CAPTURING -> OFFERING
                               |              |              |
                            DENIED          STOPPED       CHECKING_ICE
                                                               |
                                                    CONNECTED (RTC)
                                                               |
PC: NO_VIDEO -> OFFER_RECEIVED -> ANSWERING -> FRAME_WAIT -> RECEIVING_FRAMES
                                                               |
                                                         INTERRUPTED
                                                               |
                                                  RECONNECTING -> FRAME_WAIT
\`\`\`

| Evento | Resposta correta |
| --- | --- |
| Usuário nega câmera | DENIED, sem stream, instrução de permissões; tentar de novo somente por clique |
| Câmera em uso | IN_USE e botão de nova tentativa, sem crash |
| Sem HTTPS | desabilita captura e mostra como usar túnel/origem segura |
| Oferta chega duas vezes | rejeita duplicação ou ACK idempotente, não cria peer duplicado |
| Resposta de época anterior | ignora e descarta recursos antigos |
| ICE candidate antes de SDP | buffer limitado, drena depois de remoteDescription |
| Perda Wi-Fi | até 3s mostrar interrupção, não vídeo congelado como live |
| Emissor fecha aba | track termina, PC limpa quadro e oferece novo pareamento/retomada |
| Dois cliques Iniciar | compartilha promise pendente; 1 stream e 1 RTCPeerConnection |
| Android suspende câmera | onended/monitor detecta ausência, não inventa frames |
| Rede com isolamento/NAT restritivo | erro recuperável; informar limitação sem prometer TURN |
| Usuário para mídia e reinicia | nova captura autorizada, sessão válida preservada |

## 14. Pseudocódigo de testes obrigatórios

\`\`\`pseudocode
SUITE CaptureController:
    mock getUserMedia resolved com MediaStream contendo apenas video
    CHAMAR solicitarCamera -> chamada com audio:false e video ideal 720p
    simular OverconstrainedError -> tentar fallback 640x480
    simular NotAllowedError -> estado DENIED e feedback
    simular NotFoundError -> estado NOT_FOUND
    chamar iniciar duas vezes -> somente uma tentativa de permissão
    chamar parar duas vezes -> cada track.stop invocado uma vez
FIM_SUITE

SUITE RtcNegotiation:
    CONTROL recebe role e epoch válidos, cria uma oferta
    STAGE define remoteDescription antes de createAnswer
    CONTROL define remoteDescription(answer) após setLocalDescription(offer)
    candidatos antes de SDP ficam em buffer e são aplicados após
    candidatos após SDP são aplicados diretamente
    candidatos de epoch antigo são ignorados
    duplicidade de oferta não cria segundo peer ativo
    falha SDP gera RTC_NEGOTIATION_FAILED e encerra peer daquela época
FIM_SUITE

SUITE MediaHealth:
    ontrack sem quadro não define RECEIVING_FRAMES
    primeiro quadro real altera firstFrameObserved
    track ended limpa srcObject e muda status
    quadro estagnado >3000ms remove status "Ao vivo"
    reconexão atualiza geração e descarta callbacks antigos
FIM_SUITE

SUITE Integração:
    dois clientes Socket.IO reais autorizados pelo servidor
    encaminham oferta/resposta/candidatos por mesma sessão
    tentativa por sessão alheia é recusada
    fechamento de CONTROL não derruba serviço nem outra sessão
FIM_SUITE

SUITE Física (registro manual, não afirmar aprovado sem executar):
    conectar Android Chrome no HTTPS e PC Chrome na mesma Wi-Fi
    mover objeto imprevisto -> registrar que aparece no PC
    verificar navegador não pediu microfone
    desligar/religar Wi-Fi -> registrar estado e recuperação
    parar -> confirmar indicador da câmera desligado
    anotar modelo/navegador/rede/resolução observada
FIM_SUITE

EXECUTAR npm ci, lint, typecheck, test e build; anexar logs reais.
\`\`\`

## 15. Critérios de aceite e negative prompt

- Vídeo real proveniente de \`getUserMedia\` do celular, sem áudio, chega por WebRTC ao PC.
- Não declarar \`LIVE\` antes de receber quadros; em falha a tela mostra status verídico.
- P2P e rede local são preferenciais; nenhum servidor de vídeo remoto necessário.
- Permissões, erros de câmera, falhas SDP/ICE, desligamento e reconexão têm caminhos específicos.
- Eventos obedecem ao contrato e à autorização da issue #2.
- Limpeza de stream, tracks, peers, timers, callbacks e filas testada.
- A validação física permanece pendente até a execução efetiva.

**Não entregar:** slideshow em vídeo, GIF, tela negra simulando transmissão, screenshots periódicos, enviar frames por Socket.IO, stream de microfone, gravação oculta, STUN/TURN pago sem decisão registrada, números FPS/latência inventados, múltiplos peers sem limpeza, certificado inseguro, alteração da ERS para adaptar falhas do código.

**Handoff para #4:** disponibilizar \`MediaStream\` remoto vivo, metadados de resolução/frames e estados tipados. A próxima issue alinhará canvas e sistema de coordenadas ao vídeo.
