# REALITY BENDER — Issue #7: portal dimensional por gesto de mão aberta

**Versão:** 1.0 · **Issue:** https://github.com/PedroIgorBarbosa/Reality-Bender/issues/7  
**Contrato superior:** `docs/REALITY_BENDER_ERS_v1.0.md` · **Dependências:** #4, #5 e contrato `EffectPlugin` da #6.  
**RF:** RF-17, RF-19, RF-21, RF-22 · **RNF:** RNF-02, RNF-05.

## 1. Resultado e condições imutáveis

Em `PORTAL`, uma palma aberta estável convoca um anel/vórtice luminoso sobre a câmera ao vivo. A posição acompanha o centro da palma; a orientação acompanha o vetor punho→base do dedo médio; o raio responde ao grau de abertura da mão, com limiares e suavização. O portal possui borda energética, faíscas, partículas orbitais e ilusão de profundidade sem prometer oclusão 3D real.

**Invariantes:** mão ausente não gera portal em (0,0); abertura real é a fonte da escala; tremor não liga/desliga continuamente; giro atravessando −π/+π não causa salto; toda cena permanece transparente sobre vídeo; nenhuma renegociação de câmera ao selecionar modo; recursos GPU são propriedade do plugin.

## 2. Arquivos e módulos

```text
src/client/render/effects/PortalEffect.ts
src/client/render/effects/portal-parameters.ts
src/client/render/effects/portal-shaders.ts
src/client/render/effects/portal-rim.ts
src/client/render/effects/portal-particles.ts
src/client/render/effects/portal-sparks.ts
src/client/tracking/select-dominant-hand.ts
tests/unit/portal-parameters.test.ts
tests/unit/portal-angle.test.ts
tests/unit/portal-hand-selection.test.ts
tests/integration/portal-stage.test.ts
```

Reusar `EffectPlugin`, renderer e registry da #6. Se arquivo compartilhado precisar mudar, manter interface compatível com ENERGY.

## 3. Contrato de parâmetros e regras geométricas

```pseudocode
TIPO PortalInput:
    handTrackId: temporário
    palm: NormalizedPoint
    wrist: NormalizedPoint
    middleMcp: NormalizedPoint
    opennessRatio: real
    detectedAtMs: monotonic_ms
    validForGesture: boolean
    geometryVersion: inteiro
FIM_TIPO

TIPO PortalParams:
    centerCss: CssPoint
    centerNdc: NdcPoint
    angleRad: real
    tiltVisual: real clamp[-0.45,+0.45]
    radiusCssPx: real
    openness: real normalizada [0,1]
    rimIntensity: real [0,1]
    opacity: real [0,1]
    phase: OFF|ACQUIRING|ACTIVE|LOST_GRACE|FADING
FIM_TIPO

CONSTANTES DE CALIBRAÇÃO:
    openEnterThreshold = threshold medido na #5, ex. 1.7
    openExitThreshold = threshold menor, ex. 1.45
    openStableMs = 250
    graceMs = 250
    fadeMs = 450
    minRadiusFactor = 0.09 * min(stageWidth,stageHeight)
    maxRadiusFactor = 0.26 * min(stageWidth,stageHeight)
FIM
```

Esses números são parâmetros iniciais de engenharia, não reconhecimento universal de mãos. Devem ser ajustáveis e testados com câmera real; a invariável de direção permanece: mão mais aberta não deve produzir portal menor.

## 4. Algoritmo P-01 — selecionar mão principal com estabilidade

```pseudocode
FUNÇÃO selecionarMaoPrincipal(snapshot,selectedId,clock):
    mãos <- snapshot.hands com geometria válida e timestamp fresco
    SE selectedId corresponde a uma mão presente:
        RETORNAR essa mão (não trocar por outra com score levemente maior)
    FIM_SE
    SE selectedId ausente por menos de 250ms:
        RETORNAR {valid:false,retainSelection:true}
    FIM_SE
    candidatos <- mãos com abertura acima do limiar de entrada
    SE candidatos vazio:
        RETORNAR {valid:false}
    FIM_SE
    ORDENAR por estabilidade do track + confiança disponível, não apenas x
    candidato <- melhor
    EXIGIR que candidato permaneça estável durante 250ms
    SE estável:
        selectedId <- candidato.handTrackId
        RETORNAR candidato
    FIM_SE
    RETORNAR {valid:false,phase:ACQUIRING}
FIM_FUNÇÃO
```

Trocar de mão após perder a anterior deve passar por fade/reacquisition; não teleportar o portal imediatamente para o outro lado da tela.

## 5. Algoritmo P-02 — confirmar mão aberta com histerese

```pseudocode
FUNÇÃO portalPodeAtivar(hand,gestureState):
    SE mão inválida OU frame stale: RETORNAR false
    openness <- hand.opennessRatio
    SE gestureState não está ACTIVE:
        SE openness < openEnterThreshold: resetar janela; RETORNAR false
        ACUMULAR duração contínua de abertura
        RETORNAR duração >= openStableMs
    FIM_SE

    // Já ativo: usar threshold de saída menor para não piscar.
    SE openness < openExitThreshold por janela definida:
        RETORNAR false
    FIM_SE
    RETORNAR true
FIM_FUNÇÃO
```

Se a mão fecha deliberadamente, o portal deve contrair e entrar em `FADING` quando ultrapassar o limiar de saída; não congelar escala em valor alto.

## 6. Algoritmo P-03 — calcular posição, abertura e orientação

```pseudocode
FUNÇÃO calcularPortalParams(hand,geometry,previous):
    SE hand inválida OU geometryVersion incorreta: RETORNAR INVALID
    centerCss <- videoNormalizedToStage(hand.palm,geometry)
    wristCss <- videoNormalizedToStage(hand.wrist,geometry)
    middleCss <- videoNormalizedToStage(hand.middleMcp,geometry)
    SE qualquer ponto não finito/visível: RETORNAR INVALID

    dx <- middleCss.x - wristCss.x
    dy <- middleCss.y - wristCss.y
    SE hypot(dx,dy) < epsilon: RETORNAR INVALID_ANGLE
    angle <- atan2(dy,dx)   // orientação já contempla mirror da stage

    openNormalized <- CLAMP(
        (hand.opennessRatio - openExitThreshold)/
        (maxOpennessCalibration - openExitThreshold),0,1
    )
    radiusFactor <- 0.09 + openNormalized*0.17
    radiusCss <- MIN(stageWidth,stageHeight)*radiusFactor
    rimIntensity <- CLAMP(0.45 + 0.55*openNormalized,0,1)

    // Tilt 2.5D ilustrativo, sem alegar reconstrução de profundidade
    palmSpan <- comprimento validado de lado da palma
    tilt <- CLAMP(funcaoDaAssimetriaDosDedos(hand),-0.45,+0.45)

    RETORNAR {centerCss,centerNdc:stageCssToNdc(centerCss),
              angleRad:angle,tiltVisual:tilt,radiusCssPx:radiusCss,
              openness:openNormalized,rimIntensity}
FIM_FUNÇÃO
```

**Atenção:** ângulo calculado antes do espelhamento não pode ser reaplicado diretamente após espelhar a imagem. Calcular o vetor entre os dois pontos já transformados resolve o problema.

## 7. Algoritmo P-04 — rotação e dimensão sem saltos

```pseudocode
FUNÇÃO smoothPortal(target,visual,dt):
    alphaPos <- 1-exp(-gainPos*dt)
    alphaRadius <- 1-exp(-gainRadius*dt)
    deltaAngle <- atan2(sin(target.angle-visual.angle),
                        cos(target.angle-visual.angle))
    alphaRot <- 1-exp(-gainRot*dt)

    visual.position <- LERP(visual.position,target.position,alphaPos)
    visual.angle <- normalizeAngle(visual.angle+alphaRot*deltaAngle)
    visual.radius <- LERP(visual.radius,target.radius,alphaRadius)
    visual.tilt <- LERP(visual.tilt,target.tilt,alphaRot)
    visual.intensity <- LERP(visual.intensity,target.intensity,alphaRadius)
    RETORNAR visual
FIM_FUNÇÃO

TESTE_ANGULO:
    entrada anterior = +179°
    entrada nova = -179°
    deslocamento esperado ≈ +2° e não -358°
FIM
```

## 8. Algoritmo P-05 — criar anel energético e vórtice

```pseudocode
FUNÇÃO initializePortal(context):
    USAR scene, camera e renderer existentes do EffectPlugin
    CRIAR grupo PortalRoot no plano visual da câmera ortográfica
    CRIAR anel externo (torus/mesh com shader procedural):
        ringRadius = 1 unidade local
        espessura relativa do rim entre 0.06 e 0.12
        shader usa uTime, uOpening, uGlow, uOpacity
        calcular ruído angular de borda:
            irregularidade = noise(angle,time)*perturbacaoLimitada
        colorir rim entre laranja/dourado ou paleta alternativa
        gerar fragmentos brilhantes e variação temporal
    CRIAR anel interno em contra-rotação com emissão inferior
    CRIAR camada de vórtice translúcida:
        espiral procedural no fragment shader com coordenadas polares
        deslocamento radial/temporal que sugira profundidade 2.5D
    CRIAR pool de faíscas e partículas por qualidade
    REGISTRAR todos geometry,material,buffer no ResourceRegistry
    NÃO instanciar um segundo WebGLRenderer
FIM_FUNÇÃO
```

O centro do portal deve ficar preferencialmente na região da palma; limitar brilho total para não ocultar rosto/corpo permanentemente.

## 9. Algoritmo P-06 — partículas, faíscas e distorção

```pseudocode
FUNÇÃO updatePortalParticles(dt,time,params,budget):
    PARA cada partícula ativa pré-alocada:
        phase <- seed.phase+time*seed.speed
        spiralRadius <- params.radiusCss * profile(seed,phase)
        posição <- params.center + polar(phase,spiralRadius)
        tamanho <- seed.size * params.opacity
        brilho <- params.rimIntensity * envelope(seed,time)
        ATUALIZAR uniformes/atributos do buffer existente
    FIM_PARA
    NÃO criar meshes por partícula por frame
FIM_FUNÇÃO

FUNÇÃO updatePortalSparks(time,params):
    PARA faísca do pool:
        ativar somente se orçamento e intensidade permitirem
        ponto de emissão <- borda do anel na orientação angular atual
        vida <- (time-seed.birth) modulo ciclo
        posição <- borda + trajetória curta tangencial
        alpha <- params.opacity*(1-lifeNormalized)
    FIM
FIM_FUNÇÃO

FUNÇÃO comporDistorcaoVisual():
    opcionalmente aplicar perturbação de shader somente à camada do portal
    NUNCA distorcer stream real com leitura CPU de todos os pixels
    GARANTIR transparência nas regiões exteriores ao anel
FIM_FUNÇÃO
```

## 10. Algoritmo P-07 — máquina de estados e atualização RAF

```pseudocode
FUNÇÃO PortalEffect.update(now,dt,snapshot):
    SE plugin desativado OU modo != PORTAL:
        ocultar grupo, RETORNAR
    FIM_SE
    mão <- selecionarMaoPrincipal(snapshot,selectedHandId,now)
    gestureValid <- portalPodeAtivar(mão,gestureState)
    phase <- trackingMachine.update(gestureValid,now)

    SE phase=ACTIVE:
        target <- calcularPortalParams(mão,geometry,visual)
        visual <- smoothPortal(target,visual,dt)
        visual.opacity <- fadeIn(visual.opacity,dt)
    SENÃO_SE phase=LOST_GRACE:
        manter centro/angle/radius anteriores sem modificar por inferência falsa
    SENÃO_SE phase=FADING:
        visual.opacity <- fadeOutDesdePerda(now)
        reduzir partículas e halo proporcionalmente
    SENÃO_SE phase=OFF:
        ocultar PortalRoot, desativar partículas, RETORNAR
    FIM_SE

    aplicar pos/rotation/scale ao PortalRoot de maneira consistente
    updatePortalParticles(dt,now,visual)
    updatePortalSparks(now,visual)
    atualizar uTime,uGlow,uOpacity,uOpening nos shaders
FIM_FUNÇÃO
```

Um estado de perda por >400ms precisa levar a desaparecimento, mesmo quando a animação de vórtice é visualmente atraente.

## 11. Algoritmo P-08 — qualidade, descarte e isolamento de efeitos

```pseudocode
FUNÇÃO PortalEffect.applyQuality(profile):
    profile = HIGH|MEDIUM|COMPAT
    REDUZIR segmentos, partículas, faíscas e custo de glow
    NO COMPAT:
        usar fewer rings/sem distorção cara; manter controle de gesto
    NÃO alterar event listeners ou peer RTC
FIM_FUNÇÃO

FUNÇÃO PortalEffect.dispose():
    setActive(false)
    desanexar PortalRoot da cena compartilhada
    liberar somente buffers/materiais de propriedade de PORTAL
    não liberar renderer nem recursos ENERGY/AURA
    resetar selectedHandId e eventos locais do plugin
FIM_FUNÇÃO
```

## 12. Concorrência, eventos e fluxos alternativos

```text
Select PORTAL pelo PC/CONTROL -> evento stage:set-mode autenticado
    -> habilita plugin -> espera mão aberta estável -> ACQUIRING
    -> ACTIVE (palma/ângulo/raio) -> rAF compartilha video+shader
    -> desaparecimento de mão/fechamento -> LOST_GRACE -> FADING -> OFF
    -> reentrada estável -> ACQUIRING -> ACTIVE
```

| Situação | Comportamento |
| --- | --- |
| Mão aberta instável | aguardar histerese; não piscar |
| Mão fecha parcialmente | reduzir raio dentro dos limites |
| Mão fecha completamente | sair de ACTIVE e fade |
| Mão desaparece 100ms | LOST_GRACE preserva posição anterior |
| Mão ausente >400ms | efeito começa a desaparecer |
| Outras mãos entram | não mudar selectedHandId arbitrariamente |
| Mão cruza x do frame | manter continuidade, respeitar geometria espelhada |
| Orientação ±π | shortest-angle interpolation |
| Vídeo desaparece | ocultar portal e marcar interrupção real |
| GPU sem WebGL2 | vídeo permanece com aviso |
| Perfil Compatibilidade | menos faíscas e renderScale reduzido, reação preservada |
| Troca de modo | desativar só plugin, nunca fechar stream |

## 13. Pseudocódigo dos testes

```pseudocode
SUITE PortalGeometry:
    mão aberta no centro -> portal no centro
    deslocamento palma em x +0.1 -> deslocamento correspondente na stage
    palma em cima/baixo/esquerda/direita -> resposta direcional correta
    girar punho→middleMCP -> angle muda no sentido previsto
    mirror ativo -> angle e center acompanham pontos já espelhados
    abertura crescente em intervalos -> raio não decresce
    radius permanece em [minRadius,maxRadius]
    span zero, NaN, landmark faltando -> INVALID
FIM_SUITE

SUITE PortalGesture:
    100ms open -> não ativa
    300ms open -> ACTIVE
    oscilar próximo do threshold -> não entra e sai repetidamente
    fechar totalmente -> fade e OFF
    mão some >400ms -> fade
    reaparecer dentro do grace -> retornar sem teleporte
    outra mão entra -> seleção principal permanece estável
FIM_SUITE

SUITE PortalVisual:
    alternar ENERGY -> PORTAL -> NONE -> PORTAL:
        RTCPeerConnection permanece o mesmo
        um RAF compartilhado
        nenhum renderer extra
    ao dispose, registry de PORTAL volta à contagem inicial
    reduzir qualidade => reduzir instâncias reais
    simular context loss => efeito desativa sem esconder vídeo
FIM_SUITE

SUITE Física:
    demonstrar portal 2 minutos no Android/PC/data-show reais
    mover palma em 4 direções, rotacionar e abrir/fechar
    registrar vídeo, FPS e reação realmente observados
    SE equipamentos não disponíveis -> status PENDENTE
FIM_SUITE
```

## 14. Aceite e negative prompt

**Pronto quando:** portal com rim, vórtice e partículas aparece na palma aberta estável, responde continuamente à posição, orientação e abertura, controla desaparecimento por histerese, mantém câmera e outros plugins intactos e libera GPU. Testes demonstram comportamento e recursos. Registrar artefatos no grafo JSON.

**Não entregar:** portal decorativo fixo, trigger de clique no lugar de gesto, orientação calculada sem espelhar coordenadas, rotação descontinua em ±π, IA generativa remota, animação pré-gravada, raymarch de custo sem fallback, oclusão 3D declarada como real, FPS inventado.

**Handoff para #8:** `EffectPlugin` agora possui dois modos implementados; a aura deve usar a mesma pilha, agora lendo landmarks de pose em vez de palmas.
