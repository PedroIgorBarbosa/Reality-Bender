# REALITY BENDER — Issue #6: esfera de energia guiada pelas mãos

**Versão:** 1.0 · **Issue:** https://github.com/PedroIgorBarbosa/Reality-Bender/issues/6  
**Contrato superior:** \`docs/REALITY_BENDER_ERS_v1.0.md\` · **Dependências:** #4 e #5 (além de #3 para vídeo).  
**RF:** RF-17, RF-18, RF-21, RF-22 · **RNF:** RNF-02, RNF-05, RNF-15.

## 1. Entrega e invariantes

Criar o modo \`ENERGY\` como efeito cinematográfico computado no PC sobre a imagem de vídeo real. Duas palmas rastreadas controlam continuamente centro, escala e intensidade. Aproximar as mãos **aumenta** raio e brilho, afastar diminui. Efeito deve incluir núcleo luminoso, casca energética, partículas orbitais, arcos curtos e halo, respeitando perfis gráficos.

**Invariantes:** transformação espacial somente por \`videoNormalizedToStage\` (#4); snapshots somente do MediaPipe real (#5); um loop de render compartilhado, sem nova conexão WebRTC; parâmetros temporais com \`dt\`; criação/descarte de GPU controlados; sem esfera fixa desconectada da pessoa; efeito some após perda das mãos.

## 2. Arquivos e interfaces

\`\`\`text
src/client/render/effects/EffectPlugin.ts
src/client/render/effects/EnergyEffect.ts
src/client/render/effects/energy-parameters.ts
src/client/render/effects/energy-shaders.ts
src/client/render/effects/energy-particles.ts
src/client/render/effects/energy-arcs.ts
src/client/render/effects/effect-registry.ts
src/client/render/ResourceRegistry.ts
tests/unit/energy-parameters.test.ts
tests/unit/energy-state.test.ts
tests/integration/energy-stage.test.ts
\`\`\`

Reusar \`RendererLifecycle\` da #4, seus presets e os filtros/estados da #5. Não criar outra instância de Three.js WebGLRenderer.

## 3. Contrato de plugin visual

\`\`\`pseudocode
TIPO EffectPlugin:
    id: ENERGY|PORTAL|AURA
    initialize(context: {scene,camera,renderer,resourceRegistry,quality})
    update(context: {
        nowMonotonicMs, deltaSec, trackingSnapshot,
        trackingPhase, geometrySnapshot
    })
    applyQuality(profile)
    setActive(bool)
    dispose()
FIM_TIPO

TIPO EnergyInput:
    leftPalm: NormalizedPoint
    rightPalm: NormalizedPoint
    timestampMs: numero
    confidenceValid: boolean
    geometryVersion: inteiro
FIM_TIPO

TIPO EnergyParameters:
    centerCss: CssPoint
    centerNdc: NdcPoint
    radiusNorm: numero entre 0.065 e 0.205
    radiusCssPx: real >0
    normalizedIntensity: numero entre 0.4 e 1.0
    opacity: numero entre 0 e 1
    trackingPhase: EffectTrackingPhase
FIM_TIPO

TIPO ParticleBudget:
    HIGH = 4096
    MEDIUM = 2048
    COMPAT = 512
FIM_TIPO
\`\`\`

A conversão para pixels CSS utiliza o menor lado do palco, não uma constante dependente de 1920×1080.

## 4. Algoritmo E-01 — ativar modo sem alterar mídia

\`\`\`pseudocode
FUNÇÃO ativarEnergy(modeState,renderer,tracking):
    SE modeState != ENERGY:
        manter plugin desativado, NÃO conectar câmera
        RETORNAR
    FIM_SE

    SE renderer/WebGL2 indisponível:
        MOSTRAR "Efeito gráfico indisponível; vídeo continua"
        RETORNAR
    FIM_SE

    SE plugin ainda não inicializado:
        INICIALIZAR uma vez com ResourceRegistry
        CRIAR materiais, geometrias e buffers de partículas
    FIM_SE

    plugin.setActive(true)
    fase <- OFF
    AGUARDAR snapshot real contendo duas mãos válidas
    NÃO inventar posições para exibir animação
FIM_FUNÇÃO
\`\`\`

## 5. Algoritmo E-02 — calcular posição, distância, raio e intensidade

\`\`\`pseudocode
FUNÇÃO calcularParametrosEnergia(snapshot, geometry, state):
    SE snapshot stale OU não há exatamente >=2 mãos válidas:
        RETORNAR {valid:false, phase:state.trackingPhase}
    FIM_SE
    h1,h2 <- duas mãos estáveis da #5
    p1,p2 <- h1.palmCenter,h2.palmCenter
    SE p1/p2 inválidos: RETORNAR INVALID

    midpointNorm <- {(p1.x+p2.x)/2,(p1.y+p2.y)/2}
    aspectRatio <- geometry.videoWidth / geometry.videoHeight
    distance <- sqrt(((p1.x-p2.x)*aspectRatio)^2 + (p1.y-p2.y)^2)

    // Valores de referência para calibração; invariantes de direção são fixos.
    dNear <- 0.10
    dFar <- 0.80
    proximity <- CLAMP((dFar-distance)/(dFar-dNear),0,1)
    radiusNorm <- 0.065 + 0.140*proximity
    intensity <- 0.40 + 0.60*proximity

    centerCss <- videoNormalizedToStage(midpointNorm,geometry)
    SE centro fora do palco visível:
        estado <- LOST_GRACE
        RETORNAR invalid
    FIM_SE
    centerNdc <- stageCssToNdc(centerCss,geometry.stage)
    radiusCssPx <- radiusNorm * MIN(stage.cssWidth,stage.cssHeight)

    RETORNAR {valid:true, centerCss,centerNdc, radiusNorm,
              radiusCssPx, normalizedIntensity:intensity}
FIM_FUNÇÃO

PROPRIEDADES QUE DEVEM SER TESTADAS:
    se distanceA < distanceB então radius(distanceA)>=radius(distanceB)
    se distanceA < distanceB então intensity(distanceA)>=intensity(distanceB)
    midpoint permanece exatamente entre as palmas
    radius e intensity permanecem limitados mesmo em extremos
FIM
\`\`\`

Ajustar \`dNear/dFar\` depois de observar a câmera real e registrar o ajuste; não inverter comportamento para priorizar aparência.

## 6. Algoritmo E-03 — estado, suavização e interpolação por frame

\`\`\`pseudocode
FUNÇÃO atualizarEnergy(now,dt,trackingSnapshot):
    dados <- calcularParametrosEnergia(trackingSnapshot,geometry,phase)
    phase <- trackingStateMachine.update(
        hasValidGesture=dados.valid, now=now
    )

    SE phase=OFF:
        disableEnergyDraw()
        RETORNAR
    FIM_SE

    SE phase=ACQUIRING:
        preparar opacidade inicial sem teleporte
        RETORNAR ou desenhar fade-in discreto quando completar estabilidade
    FIM_SE

    SE phase=ACTIVE:
        targetCenter <- dados.centerCss
        targetRadius <- dados.radiusCssPx
        targetIntensity <- dados.normalizedIntensity
        parametrosVisuais <- smoothTowardsTarget(target,dt)
        lastGoodAnchor <- parametrosVisuais.center
        opacity <- MIN(1,opacity+dt*fadeInRate)
    FIM_SE

    SE phase=LOST_GRACE:
        preservar lastGoodAnchor como fotografia de âncora
        NÃO atualizar âncora com quadro inventado
        reduzir emissão secundária se conveniente
    FIM_SE

    SE phase=FADING:
        opacity <- proporção de tempo restante da fase
        multiplicar brilho e emissividade pela opacity
        após fade concluído, desabilitar draw de instâncias
    FIM_SE

    ATUALIZAR uniformes e transformações do grupo da esfera
    NÃO criar objetos THREE por frame
FIM_FUNÇÃO
\`\`\`

\`smoothTowardsTarget\` deve usar \`alpha = 1-exp(-k*dt)\` ou filtro equivalente estável entre 30/60/120Hz; nenhum valor especial deve depender de frames absolutos.

## 7. Algoritmo E-04 — construir núcleo e casca com shader

\`\`\`pseudocode
FUNÇÃO construirNucleo(scene,registry):
    sphereGeometry <- SphereGeometry(segmentos por qualidade)
    coreMaterial <- ShaderMaterial({
        transparent:true,
        depthWrite:false,
        blending:AdditiveBlending OU composição alfa validada,
        uniforms:{
            uTime:0,uIntensity:0,uOpacity:0,
            uCoreColor:COLOR_CYAN_BLUE,
            uNoiseStrength:...,uFresnelStrength:...
        },
        vertexShader: deformação leve por ruído temporal limitada,
        fragmentShader:
            fresnel <- POW(1-DOT(normal,viewDirection),exponent)
            pulse <- 0.85+0.15*SIN(uTime*pulseFrequency)
            glow <- saturate(noise+fresnel+pulse)
            color <- coreColor*glow*uIntensity
            alpha <- saturate(glow*uOpacity)
    })
    shellMaterial <- material mais translúcido com borda energética
    registrar geometry e materiais para dispose único
    anexar core+shell ao scene.group de ENERGY
    RETORNAR {core,shell}
FIM_FUNÇÃO
\`\`\`

O shader é procedural e reage a parâmetros reais; ruído/pulso por tempo pode existir, mas não substitui o controle contínuo das mãos.

## 8. Algoritmo E-05 — partículas orbitais com buffers limitados

\`\`\`pseudocode
FUNÇÃO construirParticulas(quality,registry):
    capacity <- particleBudget(quality)
    ALOCAR Float32Array positions[capacity*3]
    ALOCAR Float32Array seeds[capacity*4]
    CRIAR um BufferGeometry e um material de shader de partículas
    PARA i de 0 até capacity-1:
        seeds[i] <- RANDOM_DETERMINISTICO_INICIAL(i)
    FIM
    REGISTRAR buffers/material/geometry
    RETORNAR handle
FIM_FUNÇÃO

FUNÇÃO atualizarParticulas(time,dt,energyParams):
    SE ENERGY inativo: RETORNAR
    orbitRadius <- energyParams.radiusCssPx*(1.05..2.0)
    PARA cada instância ativa (ou shader GPU equivalente):
        angle <- seeds.phase + time*seeds.speed
        radius <- orbitRadius*seeds.radiusFactor
        posição <- centro + vetorOrbital(angle,radius,depth)
        intensidade <- energyParams.intensity*energyParams.opacity
    FIM
    FAZER upload apenas do buffer sujo quando CPU mode
    NÃO recriar BufferGeometry/Float32Array a cada frame
FIM_FUNÇÃO
\`\`\`

O preset Compatibilidade deve reduzir instâncias reais, não apenas mudar texto do botão.

## 9. Algoritmo E-06 — arcos elétricos e halo

\`\`\`pseudocode
FUNÇÃO prepararArcos():
    FIXAR numeroMaxArcos por qualidade
    ALOCAR pool de segmentos/curvas curtas
    REGISTRAR materiais e geometrias
FIM_FUNÇÃO

FUNÇÃO atualizarArcos(params,time):
    SE energia fraca ou OFF:
        reduzir emissão de arcos; RETORNAR
    FIM_SE
    selecionar subset pelo orçamento visual
    GERAR início/fim na superfície da esfera usando seeds estáveis
    interpolar arco com pequenos deslocamentos pseudoaleatórios
    limitar amplitude do arco proporcional ao raio
    atribuir alpha <- params.opacity * params.normalizedIntensity
    atualizar buffers existentes; NÃO criar novo material a cada arco
FIM_FUNÇÃO

FUNÇÃO comporHaloComVideo():
    aplicar glow por shader transparente OU bloom compositado com alfa
    GARANTIR que região fora de ENERGY preserve transparência alpha=0
    NÃO pintar quadra preta opaca sobre vídeo
    EVITAR saturação capaz de ocultar rosto/mãos continuamente
FIM_FUNÇÃO
\`\`\`

Se o \`EffectComposer\` escolhido produzir fundo opaco no alpha, usar passe próprio ou brilho em shader sobre canvas transparente. Não aceitar tela preta sobre a câmera como “correção”.

## 10. Algoritmo E-07 — qualidade, troca de efeito e descarte

\`\`\`pseudocode
FUNÇÃO aplicarQualidadeEnergy(profile):
    VALIDAR profile
    novoBudget <- profile.particleBudget
    usar capacidade pré-alocada quando suficiente
    SE precisar trocar capacidade:
        construir novos buffers, trocar referencia em ponto seguro do frame
        liberar buffers antigos SEM acumular
    FIM_SE
    atualizar segmentos da esfera e passes de brilho configurados
    preservar centro/raio/intensidade e stateMachine
    NÃO interromper RTCPeerConnection
FIM_FUNÇÃO

FUNÇÃO desativarEnergy():
    setActive(false)
    congelar nenhum âncora para uso como vídeo
    liberar instâncias temporárias quando aplicável
    preservar apenas recursos compartilháveis sob controle do registry
FIM_FUNÇÃO

FUNÇÃO disposeEnergy():
    MARCAR disposed=true
    remover grupo da cena e handlers locais
    registry.disposeOwnedBy("ENERGY")
    limpar referências e timers
FIM_FUNÇÃO
\`\`\`

## 11. Fluxo de sequência e concorrência

\`\`\`text
Celular getUserMedia -> WebRTC (#3) -> video remoto no PC
                                  -> MediaPipe (#5) -> TrackingSnapshot
                                                     |
StageMode ENERGY (#4) -------------------------------+
                                                     v
                              EnergyParameters (funções puras)
                                                     |
                         EffectTrackingPhase + EMA temporal
                                                     |
             requestAnimationFrame compartilhado de RendererLifecycle
                                                     |
                     Núcleo + casca + partículas + arcos transparentes
                                                     |
                                      data-show sobre vídeo real
\`\`\`

- O motor deve consumir o snapshot mais recente do tracking e descartar snapshots com timestamp antigo.
- Trocar \`ENERGY\`→\`NONE\` nunca interrompe o vídeo.
- Novo snapshot chegando durante fade deve reativar segundo transição válida, não duplicar grupos da esfera.
- \`update\` respeita \`deltaSec\` limitado e não aloca novos recursos caros por frame.

## 12. Falhas e fluxos alternativos

| Condição | Tratamento |
| --- | --- |
| Uma única mão | não criar esfera, aguardar duas mãos |
| Segunda mão some 100ms | manter posição de graça, sem teleporte |
| Perda longa >400ms | iniciar fade, depois OFF |
| Mãos se cruzam | preservar continuidade de palma por tracking da #5 |
| Raio fora dos limites | clamp matemático sem NaN nem explosão de geometria |
| Geometria obsoleta | aguardar snapshot compatível com geometryVersion |
| WebGL2 indisponível | vídeo permanece, status de efeito indisponível |
| Contexto GPU perdido | restaurar recursos ou desativar apenas gráfico |
| Troca repetida de modo | não duplicar loop RAF/buffers |
| Perfil gráfico rebaixado | reduzir orçamento de partículas e resolução |
| Vídeo interrompido | eliminar status live e iniciar transição de desaparecimento |

## 13. Pseudocódigo dos testes

\`\`\`pseudocode
SUITE EnergyMath:
    duas palmas (0.2,0.5) e (0.8,0.5):
        center=(0.5,0.5) em coords normalizadas
    deslocar ambas +0.1 em x:
        center desloca +0.1, mantendo distância
    aproximar mãos com distancias [0.8,0.6,0.4,0.2,0.1]:
        radius deve ser não decrescente
        intensity deve ser não decrescente
    afastar: radius e intensidade não crescem
    extremos: radius dentro do clamp definido
    landmarks NaN e só uma mão: resultado inválido
    mirror ativo: centro projetado espelha exatamente uma vez
FIM_SUITE

SUITE EnergyPhase:
    2 mãos por 100ms -> ainda ACQUIRING
    2 mãos por >=250ms -> ACTIVE
    perder 1 mão por 100ms -> LOST_GRACE sem mover
    perder >250ms -> FADING; depois OFF
    recuperar durante grace -> ACTIVE sem salto
FIM_SUITE

SUITE RendererAndResources:
    ativar/desativar 10 vezes:
        número de loops RAF = 1 em cada momento
        registry resources retornam ao baseline após dispose
    trocar HIGH→COMPAT:
        instâncias ativas diminuem 4096→512
    girar dispositivo / fullscreen:
        esfera continua alinhada à posição transformada
    simular context lost:
        vídeo permanece e efeito desativa com mensagem
FIM_SUITE

SUITE Física (somente aprovação após execução):
    usar celular real + PC + data-show
    mostrar duas mãos e variar distância
    mover as duas mãos para todos os lados
    confirmar esfera segue centro e escala em tempo real
    operar dois minutos, medir FPS real na máquina
    registrar equipamento, resolução, perfil e teste executado/pendente
FIM_SUITE
\`\`\`

## 14. Critérios de aceite e negative prompt

**Pronto quando:** esfera possui núcleo, casca, partículas, arcos e halo; duas mãos reais controlam centro/escala/brilho; perda provoca fade; \`NONE\` preserva stream; perfis realmente reduzem custo; recursos GPU são liberados; testes matemáticos e de ciclo de vida executados. Registrar no grafo JSON as alterações e relações entre arquivos.

**Não entregar:** esferas fixas, vídeos/gifs, simulação com mouse apresentada como produção, código GPU que aloca a cada frame, renderer duplicado, pós-processamento opaco que cobre vídeo, raio crescente ao afastar as mãos, sucesso de FPS inventado ou dependência de serviço pago.

**Handoff para #7 e #8:** mesmo contrato \`EffectPlugin\`, \`ResourceRegistry\`, geometria e ciclo RAF; cada novo efeito deve apenas acrescentar cálculo de parâmetros e geometria específica.
