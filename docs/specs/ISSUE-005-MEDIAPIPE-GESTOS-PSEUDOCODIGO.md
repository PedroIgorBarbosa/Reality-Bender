# REALITY BENDER — Issue #5: MediaPipe, calibração e motor de gestos

**Versão:** 1.0 · **Issue:** https://github.com/PedroIgorBarbosa/Reality-Bender/issues/5  
**Contrato superior:** `docs/REALITY_BENDER_ERS_v1.0.md` · **Dependências:** #3 e #4.  
**RF:** RF-12, RF-13, RF-14, RF-15, RF-16 · **RNF:** RNF-04, RNF-05, RNF-16.

## 1. Resultado e invariantes

Quadros **reais** do vídeo remoto serão analisados no PC pelo MediaPipe Hand Landmarker (até duas mãos) e Pose Landmarker (uma pessoa). Pontos anatomicos serão normalizados e convertidos em gestos e âncoras de efeitos. O motor aplicará histerese e suavização temporal e permitirá calibração visual verificável. Nenhum ponto será fabricado se a detecção falhar.

**Invariantes:** inferência apenas após vídeo recebido; nunca crescer fila; só frame mais recente; nenhum `requestAnimationFrame` executa múltiplas inferências simultâneas; timestamp monotônico; mão ausente = estado de perda, não coordenada (0,0); vídeo continua enquanto tracking falha; medição de desempenho não inventada.

## 2. Estrutura de módulos

```text
src/client/tracking/model-loader.ts
src/client/tracking/frame-scheduler.ts
src/client/tracking/mediapipe-runner.ts
src/client/tracking/landmark-contracts.ts
src/client/tracking/hand-identity.ts
src/client/tracking/geometry-pure.ts
src/client/tracking/gesture-classifier.ts
src/client/tracking/adaptive-smoother.ts
src/client/tracking/tracking-state-machine.ts
src/client/tracking/calibration-controller.ts
src/client/tracking/useTrackingPipeline.ts
src/client/components/CalibrationPanel.tsx
tests/unit/hand-geometry.test.ts
tests/unit/hand-identity.test.ts
tests/unit/gesture-classifier.test.ts
tests/unit/tracking-state-machine.test.ts
tests/unit/calibration.test.ts
tests/integration/tracking-scheduler.test.ts
```

Modelos/arquivos WASM deverão estar hospedados localmente quando permitido por suas licenças; documentar versões, origem e integridade. Não buscar API externa de inferência.

## 3. Tipos, relógios e configurações

```pseudocode
TIPO NormalizedLandmark:
    x: numero finito
    y: numero finito
    z: numero finito|ausente
    visibility: numero[0,1]|ausente
    presence: numero[0,1]|ausente
FIM_TIPO

TIPO HandDetection:
    handTrackId: ID_TEMPORARIO
    handedness: "Left"|"Right"|"Unknown"
    handednessScore: numero[0,1]|ausente
    landmarks: ARRAY[21] de NormalizedLandmark
    detectedAtMs: MONOTONIC_MS
    palmCenter: NormalizedPoint|null
    opennessRatio: numero|null
    wristToMiddleAngle: radianos|null
FIM_TIPO

TIPO PoseDetection:
    landmarks: ARRAY do modelo PoseLandmarker
    detectedAtMs: MONOTONIC_MS
    trackedJoints: shoulders/elbows/wrists/hips
FIM_TIPO

TIPO TrackingSnapshot:
    frameId: numero
    frameTimestampMs: MONOTONIC_MS
    hands: 0..2 HandDetection
    pose: PoseDetection|null
    gesture: OPEN_HAND|CLOSED_HAND|TWO_HANDS_VISIBLE|
             ARMS_OPEN|NO_TRACKING|UNSTABLE
    calibrating: bool
    confidenceQuality: LOW|MEDIUM|HIGH|UNKNOWN
    stale: bool
FIM_TIPO

ENUM EffectTrackingPhase =
    OFF | ACQUIRING | ACTIVE | LOST_GRACE | FADING

CONFIG:
    inferenceIntervalMsInicial = 67  // teto ~15 inferências/s
    maxInferenceBacklog = 1
    gestureStableMs = 250
    lostGraceMs = 250
    fadeDurationMs = 450
    maxLandmarkAgeMs = 400
    minimumHandednessScore = 0.55
    minimumPoseVisibility = 0.5
    maxVelocityNormalizedPerSecond = valor calibrável e testado
FIM_CONFIG
```

**Cuidado com o modelo:** nem todo resultado do Hand Landmarker possui score de visibilidade por landmark. Nunca inventar confiança; usar campos efetivamente retornados (`handedness` e scores de classificação quando presentes), consistência espacial/temporal e visibilidade da pose.

## 4. Algoritmo T-01 — carregar modelos de forma verificável

```pseudocode
FUNÇÃO carregarModelosTracking():
    VALIDAR navigator/WebGL/WASM suportados conforme runtime
    SE vídeo remoto não está pronto:
        estado <- WAITING_FOR_VIDEO
        RETORNAR sem inferência
    FIM_SE

    TENTAR:
        wasm <- AGUARDAR FilesetResolver.forVisionTasks("/models/wasm")
        hand <- AGUARDAR HandLandmarker.createFromOptions(wasm, {
            baseOptions:{modelAssetPath:"/models/hand_landmarker.task",
                         delegate:DELEGATE_COMPATIVEL},
            runningMode:"VIDEO", numHands:2
        })
        pose <- AGUARDAR PoseLandmarker.createFromOptions(wasm, {
            baseOptions:{modelAssetPath:"/models/pose_landmarker.task",
                         delegate:DELEGATE_COMPATIVEL},
            runningMode:"VIDEO", numPoses:1
        })
    CAPTURAR falha:
        SE delegate GPU falhou:
            tentar CPU uma única vez
        SENÃO:
            estado <- MODEL_LOAD_FAILED
            MOSTRAR "Não foi possível carregar reconhecimento corporal"
            NÃO declarar calibrado ou inferência funcionando
        FIM_SE
    FIM_TENTATIVA
    RETORNAR objetos inicializados e função dispose
FIM_FUNÇÃO
```

Delegates CPU/GPU dependem das versões reais da biblioteca; documentar qual foi testado. Não bloquear por Worker sem API suportada.

## 5. Algoritmo T-02 — agendar quadros novos sem backlog

```pseudocode
FUNÇÃO iniciarFrameScheduler(video,runner):
    PRECONDICAO: stream RTC em estado de frames saudáveis
    generation <- contador.incrementar()
    inferenciaOcupada <- false
    ultimaInferenciaMs <- -infinito
    ultimoFrameId <- -1

    FUNÇÃO aoNovoFrame(now, metadata):
        SE generation != atual OU video sem frame válido:
            RETORNAR
        FIM_SE
        frameId <- metadata.presentedFrames OU contador de frames
        SE frameId <= ultimoFrameId:
            REAGENDAR callback e RETORNAR
        FIM_SE
        ultimoFrameId <- frameId

        SE inferenciaOcupada OU now-ultimaInferenciaMs < intervaloAtual:
            CONTAR quadro descartado
            REAGENDAR callback; NÃO enfileirar
            RETORNAR
        FIM_SE
        inferenciaOcupada <- true
        timestamp <- performance.now()
        TENTAR:
            resultado <- runner.detectForVideo(video,timestamp)
            SE generation ainda atual:
                PUBLICAR normalizacao(resultado, timestamp, frameId)
                MEDIR tempo gasto usando performance.now() antes/depois
            FIM_SE
        CAPTURAR erro:
            PUBLICAR erro específico, sem coordenadas inventadas
        FINALMENTE:
            inferenciaOcupada <- false
            ultimaInferenciaMs <- performance.now()
            REAGENDAR callback apenas se generation atual
        FIM_TENTATIVA
    FIM_FUNÇÃO

    USAR video.requestVideoFrameCallback quando disponível
    SENÃO usar requestAnimationFrame com checagem do tempo de vídeo/quadros
    NÃO usar setInterval que acumula trabalho
    PARAR e cancelar callbacks ao mudar stream, negociar novo epoch ou unmount
FIM_FUNÇÃO
```

`detectForVideo` pode bloquear a thread; começar com orçamento ~10–20/s e ajustar por medição. Worker com `OffscreenCanvas` é opcional se testado; não inventar transferências de vídeo incompatíveis.

## 6. Algoritmo T-03 — validar e normalizar landmarks

```pseudocode
FUNÇÃO normalizarResultado(resultado, videoInfo, timestamp):
    REJEITAR resultado sem timestamp monotônico
    PARA cada mão retornada, máximo 2:
        SE landmarks.length != 21 OU coordenadas não finitas:
            IGNORAR mão inválida
        FIM_SE
        VALIDAR x,y no intervalo plausível [-epsilon,1+epsilon]
        NÃO fazer clamp de NaN para 0
        ASSOCIAR classificação handedness somente se score existir
        CALCULAR palma e abertura com geometria pura
    FIM_PARA

    PARA pose (máximo uma):
        LER ombros, cotovelos, punhos, quadris por índices da biblioteca
        VALIDAR visibility/presence quando disponíveis
        REJEITAR junta isolada se não atingir critério configurado
    FIM_PARA

    NÃO inverter left/right por label só porque vídeo será espelhado;
        handedness da biblioteca e mirror de projeção são conceitos separados
    ASSOCIAR os pontos ao videoWidth/Height da mesma versão de geometria
    RETORNAR snapshot bruto tipado
FIM_FUNÇÃO
```

## 7. Algoritmo T-04 — âncoras, medidas e relações espaciais

```pseudocode
FUNÇÃO palmCenter(hand):
    p0 <- hand.landmarks[0]    // punho
    p5 <- hand.landmarks[5]    // base do indicador
    p9 <- hand.landmarks[9]    // base do dedo médio
    p17 <- hand.landmarks[17]  // base mínimo
    VALIDAR quatro pontos
    center.x <- (p0.x + p5.x + p9.x + p17.x)/4
    center.y <- (p0.y + p5.y + p9.y + p17.y)/4
    RETORNAR center
FIM_FUNÇÃO

FUNÇÃO distance2D(a,b,aspectRatio):
    dx <- (a.x-b.x)*aspectRatio
    dy <- a.y-b.y
    RETORNAR sqrt(dx*dx + dy*dy)
FIM_FUNÇÃO

FUNÇÃO centerBetweenHands(h1,h2):
    RETORNAR {(h1.palm.x+h2.palm.x)/2,
              (h1.palm.y+h2.palm.y)/2}
FIM_FUNÇÃO

FUNÇÃO handOpennessRatio(hand):
    palmSpan <- distance2D(hand[5],hand[17],aspectRatio)
    SE palmSpan < epsilon: RETORNAR INVALID
    tipDistances <- [
        distance(hand[8],hand[0]),
        distance(hand[12],hand[0]),
        distance(hand[16],hand[0]),
        distance(hand[20],hand[0])
    ]
    openness <- media(tipDistances)/palmSpan
    RETORNAR clamp(openness,MIN_VALID,MAX_VALID)
FIM_FUNÇÃO

FUNÇÃO handOrientation(hand):
    wrist <- hand[0]; middleBase <- hand[9]
    SE distance(wrist,middleBase) < epsilon: INVALID
    RETORNAR atan2(middleBase.y-wrist.y,
                   (middleBase.x-wrist.x)*aspectRatio)
FIM_FUNÇÃO

FUNÇÃO armSpread(pose):
    VERIFICAR ombros e punhos válidos
    shoulderWidth <- dist(shoulderL,shoulderR)
    SE shoulderWidth < epsilon: INVALID
    RETORNAR clamp(dist(wristL,wristR)/shoulderWidth,0,LIMIT)
FIM_FUNÇÃO
```

Essas fórmulas são base determinística; escalas e limiares de abertura dependem de calibração e devem ter testes de direção e robustez a diferentes tamanhos de mão.

## 8. Algoritmo T-05 — rastrear identidade de mãos sem saltos

```pseudocode
FUNÇÃO associarMaos(detecçõesAtuais, tracksAnteriores, timestamp):
    REMOVER tracks com timestamp antigo > maxLandmarkAgeMs
    PARA cada detecção:
        CALCULAR distância de palma às últimas posições de tracks
        APLICAR penalidade moderada por handedness incompatível
        ENCONTRAR associação de menor custo (até duas mãos)
        SE distância > limite plausível:
            ATRIBUIR nova ID_TEMPORÁRIA
        SENÃO:
            ATUALIZAR track associada e seu timestamp
        FIM_SE
    FIM_PARA
    SE duas mãos cruzarem:
        preferir continuidade espacial + handedness quando confiável;
        não forçar troca só por inversão esquerda/direita na tela
    FIM_SE
    RETORNAR tracks estáveis, sem armazenar identidade biométrica
FIM_FUNÇÃO
```

A associação serve apenas para continuidade visual temporária, não identificação da pessoa.

## 9. Algoritmo T-06 — classificação e histerese dos gestos

```pseudocode
FUNÇÃO classificarGestos(snapshot, thresholds):
    mãosValidas <- filtrar mãos com landmarks/score aceitáveis
    SE comprimento(mãosValidas)=0 E pose inválida:
        RETORNAR NO_TRACKING
    FIM_SE

    SE comprimento(mãosValidas)=2:
        adicionar TWO_HANDS_VISIBLE
    FIM_SE

    PARA cada mão válida:
        abertura <- handOpennessRatio(mão)
        SE abertura >= openEnterThreshold:
            adicionar OPEN_HAND
        SENÃO SE abertura <= closeEnterThreshold:
            adicionar CLOSED_HAND
        SENÃO:
            adicionar UNSTABLE
        FIM_SE
    FIM_PARA
    SE pose válida e armSpread >= armsOpenEnterThreshold:
        adicionar ARMS_OPEN
    FIM_SE
    RETORNAR vetor de condições candidatas
FIM_FUNÇÃO

FUNÇÃO atualizarGestosEstaveis(candidato,clock):
    SE candidato difere do candidatoAnterior:
        candidatoAnterior <- candidato
        candidateSince <- clock.now()
    FIM_SE
    SE clock.now()-candidateSince >= 250ms
       E candidato respeita limiar de entrada:
        confirmar novo gesto
    FIM_SE
    PARA abandonar gesto usar limiar de saída distinto do de entrada
    NÃO disparar múltiplos eventos por oscilação em poucos frames
FIM_FUNÇÃO
```

## 10. Algoritmo T-07 — suavização, limites e timestamps

```pseudocode
FUNÇÃO smoothPoint(raw,previous,now):
    SE raw inválido: RETORNAR previous com marcador STALE, nunca ACTIVE
    dt <- (now-previous.timestamp)/1000
    SE dt<=0 OU dt>1: reinicializar suavizador com raw
    velocity <- distance(raw,previous.position)/MAX(dt,epsilon)
    SE velocity > maxVelocityConfigured:
        limitar deslocamento e marcar outlier
    FIM_SE
    alpha <- CLAMP(alphaMin + gain*velocity,alphaMin,alphaMax)
    filtered <- previous.position + alpha*(raw-previous.position)
    RETORNAR {position:filtered,timestamp:now,valid:true}
FIM_FUNÇÃO

FUNÇÃO smoothAngle(angle,previous,dt):
    delta <- atan2(sin(angle-prev),cos(angle-prev))
    RETORNAR normalizeAngle(prev + alpha(delta,dt)*delta)
FIM_FUNÇÃO
```

A suavização deve reduzir tremor sem retardar excessivamente movimentos rápidos. O `requestAnimationFrame` da cena interpola entre snapshots válidos; não exige uma inferência por frame de renderização.

## 11. Algoritmo T-08 — máquina de estados de efeito rastreado

```pseudocode
FUNÇÃO atualizarEstadoTracking(state, validGesture, now):
    SE state=OFF:
        SE validGesture: return ACQUIRING(since=now)
        RETORNAR OFF
    FIM_SE

    SE state=ACQUIRING:
        SE !validGesture: return OFF
        SE now-since>=250ms: return ACTIVE
        RETORNAR ACQUIRING
    FIM_SE

    SE state=ACTIVE:
        SE validGesture: atualizar lastValidAt e âncora; return ACTIVE
        SENÃO: return LOST_GRACE(lastValidAt, lastAnchor)
    FIM_SE

    SE state=LOST_GRACE:
        SE validGesture: return ACTIVE
        SE now-lastValidAt>250ms: return FADING(since=now)
        RETORNAR LOST_GRACE sem mover âncora
    FIM_SE

    SE state=FADING:
        SE validGesture estabilizado: voltar ACQUIRING ou ACTIVE com fade-in
        SE now-since>=450ms: return OFF
        RETORNAR FADING com opacity=1-(now-since)/450
    FIM_SE
FIM_FUNÇÃO
```

Perda superior a 400ms precisa **iniciar** desaparecimento, não preservar efeito permanente.

## 12. Algoritmo T-09 — calibração observável e reexecutável

```pseudocode
FUNÇÃO iniciarCalibracao():
    VALIDAR RTC com vídeo fresco, modelos carregados
    reset janela de observações para 0
    MOSTRAR instruções: posição central, braços/mãos visíveis,
                        iluminação uniforme, enquadrar tronco
    DURANTE cada resultado novo:
        QUALIDADE <- detectar número de mãos, pose, validade e estabilidade
        SE resultados insuficientes:
            reset contador de estabilidade
            MOSTRAR o motivo real "Mãos fora do quadro" ou "Corpo não detectado"
        SENÃO:
            acumular duração de estabilidade observada
        FIM_SE
        SE estabilidade >= intervalo definido (p.ex. 800ms):
            GRAVAR somente parâmetros de escala da sessão, sem imagem
            STATUS <- CALIBRATED
            MOSTRAR "Calibrado"
        FIM_SE
    FIM_DURANTE
    SE timeout sem confiança:
        STATUS <- NEEDS_RETRY
        MOSTRAR "Reposicione-se e tente novamente"
    FIM_SE
FIM_FUNÇÃO

FUNÇÃO recalibrar():
    invalidar calibração anterior, preservar RTC e permissões de câmera
    iniciarCalibracao()
FIM_FUNÇÃO
```

Não afirmar luz ruim somente por suposição; se não medir luminância, informar `rastreamento insuficiente (possível iluminação/enquadramento)`.

## 13. Fluxos alternativos e concorrência

| Situação | Tratamento obrigatório |
| --- | --- |
| Quadro repetido ou mais antigo | descartar sem atualizar timestamp |
| Inferência lenta | descartar quadros intermediários, manter fila no máximo 1 |
| Modelo faltando/arquivo 404 | `MODEL_LOAD_FAILED`, vídeo preservado, caminho de recuperação |
| Landmark inválido/NaN | excluir ponto/gesto, nunca marcar mão em (0,0) |
| Duas mãos cruzadas | associação temporal; evitar teleporte de efeitos |
| Mão desaparece por 100 ms | `LOST_GRACE`, âncora congelada mas marcada obsoleta |
| Mão desaparece por >400 ms | `FADING`, emissão diminuindo |
| Pausa aba/dispositivo | invalidar timestamps velhos e aguardar novos frames |
| Retrato/paisagem | usar geometria da #4 com versão correspondente |
| Ausência de corpo, mãos presentes | permitir efeitos de mão, aura indisponível |
| Worker incompatível | fallback no PC com throttle, documentar custo real |
| Reconnect WebRTC | invalidar pipeline antigo, reconstruir apenas após novo quadro |

## 14. Pseudocódigo de testes

```pseudocode
SUITE Geometria:
    palmCenter([punho,base indicador,base medio,base minimo]) esperado
    distancias iguais em vídeos com relações de aspecto diferentes
    openness cresce quando dedos abrem; zero span -> INVALID
    handOrientation em quadrantes de atan2
    spread normalizado cresce quando braços se afastam
    NaN, Infinito, pontos faltando => resultados inválidos
FIM_SUITE

SUITE IdentidadeEEstabilidade:
    mão movendo continuamente mantém id temporário
    mãos cruzadas mantêm continuidade quando sinal é suficiente
    detecção 0 mãos -> NO_TRACKING
    gesto só confirma após 250ms estáveis
    oscilações com histerese não alternam infinitamente
    suavizador não altera âncora com timestamp velho
FIM_SUITE

SUITE MaquinaDeEstados:
    OFF -> ACQUIRING -> ACTIVE com 250ms de estabilidade
    ACTIVE -> LOST_GRACE após perda
    LOST_GRACE -> ACTIVE ao recuperar antes do prazo
    LOST_GRACE -> FADING depois de 250ms
    FADING -> OFF após 450ms
    calibracao só conclui depois da janela válida
FIM_SUITE

SUITE FrameScheduler:
    enviar callbacks a 60fps com inferência de 80ms
    VERIFICAR não há duas inferências simultâneas
    VERIFICAR fila não cresce com 60 callbacks
    trocar stream -> descartar callbacks gerados na anterior
    alterar orientação -> atualizar geometryVersion para todos outputs
FIM_SUITE

SUITE Física (somente quando executada):
    1 mão, 2 mãos, braços e perda de enquadramento reais
    medir tempos de inferência e observação de quadros
    verificar que vídeo segue mesmo sem pose
    registrar dispositivo, navegador e sucesso/falha reais
FIM_SUITE
```

## 15. Aceite e negative prompt

**Pronto quando:** MediaPipe processa quadros remotos reais, produz snapshots tipados com no máximo duas mãos e uma pose, calibração baseada em observação, estados de gestos confiáveis, atualizações sem backlog, tratamento de ausência e testes executados. Qualquer medição de FPS/inferência deve ser real e identificada. Registrar relação dos arquivos no grafo JSON.

**Não entregar:** landmarks fictícios no modo de produção, fila de inferência ilimitada, modelo remoto pago, cálculo em vídeo gravado apresentado como live, pose de múltiplas pessoas, classificação baseada apenas em rótulo de mão, segredos/frames no grafo, Worker inventado sem execução, travar vídeo enquanto modelos falham.

**Handoff para #6–#8:** API de snapshots válida, âncoras puras, filtro temporal e máquina de estados reutilizáveis pelos três efeitos. Cada efeito apenas mapeia esses dados em parâmetros visuais.
