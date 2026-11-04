# REALITY BENDER — Issue #8: aura elétrica reativa ao corpo e aos braços

**Versão:** 1.0 · **Issue:** https://github.com/PedroIgorBarbosa/Reality-Bender/issues/8  
**Contrato superior:** \`docs/REALITY_BENDER_ERS_v1.0.md\` · **Dependências:** #4, #5 e \`EffectPlugin\` de #6.  
**RF:** RF-13, RF-17, RF-20, RF-22 · **RNF:** RNF-02, RNF-05, RNF-15.

## 1. Resultado e garantias

Construir o modo \`AURA\` com traços elétricos, glow, ramificações e partículas que acompanham tronco, ombros e **cada braço independentemente**. A imagem da pessoa continua ao vivo. A amplitude de abertura e a velocidade normalizada dos braços controlam a intensidade de forma contínua. Se um braço levantar, sua energia muda sem obrigar o outro a fazer o mesmo.

**Invariantes:** nenhum contorno fixo em viewport, nenhum vídeo de relâmpago pronto, todos os segmentos precisam de pelo menos um ponto de pose válido recente; perda de pose deve levar a fade; espelhamento respeita #4; pose real vem de #5; GPU usa buffers compartilháveis sem alocação por frame; não exigir segmentação ou reconstrução corporal 3D perfeita.

## 2. Responsabilidade e arquivos

\`\`\`text
src/client/render/effects/AuraEffect.ts
src/client/render/effects/aura-skeleton.ts
src/client/render/effects/aura-geometry.ts
src/client/render/effects/aura-parameters.ts
src/client/render/effects/aura-shaders.ts
src/client/render/effects/aura-particles.ts
src/client/render/effects/aura-branching.ts
tests/unit/aura-skeleton.test.ts
tests/unit/aura-intensity.test.ts
tests/unit/aura-lines.test.ts
tests/integration/aura-stage.test.ts
\`\`\`

Reusar \`ResourceRegistry\`, \`RendererLifecycle\`, \`QualityProfiles\` e \`trackingStateMachine\`. Não criar componentes concorrentes de captura/MediaPipe.

## 3. Contratos de articulações e parâmetros

\`\`\`pseudocode
TIPO BodyJoints:
    leftShoulder: PointWithValidity
    rightShoulder: PointWithValidity
    leftElbow: PointWithValidity
    rightElbow: PointWithValidity
    leftWrist: PointWithValidity
    rightWrist: PointWithValidity
    leftHip: PointWithValidity
    rightHip: PointWithValidity
    frameTimestampMs: monotonic_ms
FIM_TIPO

TIPO ArmState:
    side: LEFT|RIGHT
    shoulder/elbow/wrist: CssPoint
    valid: boolean
    spreadNormalized: real >=0
    velocityNormalizedPerSec: real >=0
    intensity: real [0,1]
    trackingPhase: EffectTrackingPhase
    lastSeenAt: monotonic_ms
FIM_TIPO

TIPO AuraParams:
    torsoCenter: CssPoint
    shoulderWidthCss: real>0
    leftArm: ArmState
    rightArm: ArmState
    torsoOpacity: real [0,1]
    totalIntensity: real [0,1]
    geometryVersion: inteiro
FIM_TIPO

CONFIG:
    minPoseVisibility=0.5 (para landmarks com visibility disponível)
    minShoulderWidthCss=12px
    graceMs=250
    fadeMs=450
    intensityWeights: spread=0.55, speed=0.45
    particleBudgets: HIGH=2200,MEDIUM=1100,COMPAT=250
    armSampleBudget: HIGH=32,MEDIUM=16,COMPAT=8
FIM
\`\`\`

Se MediaPipe não fornecer \`visibility\` para uma articulação, usar geometria plausível e resultados reais sem inventar \`0.99\`. Um score desconhecido é \`unknown\`, não \`high\`.

## 4. Algoritmo A-01 — extrair esqueleto real e pontos válidos

\`\`\`pseudocode
FUNÇÃO extrairJuntasPose(snapshot,geometry):
    SE snapshot.pose=null OU snapshot stale:
        RETORNAR {valid:false,reason:POSE_MISSING}
    FIM_SE

    INDX = {
        leftShoulder:11, rightShoulder:12,
        leftElbow:13, rightElbow:14,
        leftWrist:15, rightWrist:16,
        leftHip:23, rightHip:24
    }
    PARA cada joint em INDX:
        landmark <- snapshot.pose.landmarks[INDX[joint]]
        SE ausente/NaN/visibility insuficiente:
            joint.valid <- false; CONTINUAR
        FIM_SE
        joint.position <- videoNormalizedToStage(landmark,geometry)
        joint.valid <- joint.position visible
    FIM_PARA

    SE os dois ombros inválidos:
        RETORNAR {valid:false,reason:SHOULDERS_MISSING}
    FIM_SE

    leftArmValid <- leftShoulder e leftElbow e leftWrist válidos
    rightArmValid <- rightShoulder e rightElbow e rightWrist válidos
    torsoValid <- ombros válidos e pelo menos 1 hip válido
    NÃO invalidar braço direito só porque esquerdo faltou
    RETORNAR joints + flags sem misturar espelhamento nos rótulos
FIM_FUNÇÃO
\`\`\`

A distinção esquerda/direita anatômica pertence ao Pose Landmarker; o movimento na tela é determinado pelo mesmo mapeador de vídeo da #4. Não inverter \`LEFT\` e \`RIGHT\` duas vezes.

## 5. Algoritmo A-02 — escala corporal e tronco

\`\`\`pseudocode
FUNÇÃO calcularBaseCorporal(joints):
    VALIDAR leftShoulder e rightShoulder
    shoulderWidth <- DIST(joints.leftShoulder,joints.rightShoulder)
    SE shoulderWidth < minShoulderWidthCss:
        RETORNAR INVALID_SCALE
    FIM_SE

    shoulderCenter <- MIDPOINT(leftShoulder,rightShoulder)
    hipCenter <- MIDPOINT(leftHip,rightHip) quando ambos disponíveis
                 SENÃO usar apenas quadril válido com status "partial"
    torsoCenter <- MIDPOINT(shoulderCenter,hipCenter) se hip válido
                   SENÃO shoulderCenter com confiança reduzida
    torsoPath <- [
        leftShoulder,shoulderCenter,rightShoulder,
        hipCenter quando disponível
    ]
    RETORNAR {shoulderWidth,shoulderCenter,hipCenter,torsoCenter,
              torsoPath,torsoQuality}
FIM_FUNÇÃO
\`\`\`

Todas as medidas de movimento devem ser normalizadas pela largura do ombro (com piso de segurança), para pessoas distantes/próximas terem parâmetros coerentes.

## 6. Algoritmo A-03 — intensidade independente de cada braço

\`\`\`pseudocode
FUNÇÃO calcularIntensidadeBraco(side,joints,previous,now,scale):
    points <- shoulder,elbow,wrist do lado correspondente
    SE algum ponto inválido:
        RETORNAR {valid:false,phase:LOST_GRACE}
    FIM_SE

    spread <- DIST(wrist,shoulder)/MAX(scale.shoulderWidth,epsilon)
    spreadNorm <- CLAMP((spread-spreadAtRest)/
                        (spreadAtMax-spreadAtRest),0,1)

    dt <- (now-previous.timestamp)/1000
    SE dt<=0 OU dt>0.5 OU previous inválido:
        speedNorm <- 0
    SENÃO:
        speed <- DIST(wrist,previous.wrist)/dt
        speedNorm <- CLAMP(speed/
                          (scale.shoulderWidth*expectedFastArmRate),0,1)
    FIM_SE

    rawIntensity <- 0.55*spreadNorm + 0.45*speedNorm
    alpha <- 1-exp(-intensitySmoothingGain*MAX(dt,0))
    intensity <- LERP(previous.intensity,rawIntensity,alpha)
    RETORNAR {valid:true,spreadNorm,speedNorm,
              intensity:CLAMP(intensity,0,1),points}
FIM_FUNÇÃO

FUNÇÃO atualizarIntensidades(joints):
    left <- calcularIntensidadeBraco(LEFT,joints,previousLeft,...)
    right <- calcularIntensidadeBraco(RIGHT,joints,previousRight,...)
    total <- MAX(left.intensity,right.intensity)*0.6 +
             MIN(left.intensity,right.intensity)*0.4
    RETORNAR {left,right,total:CLAMP(total,0,1)}
FIM_FUNÇÃO
\`\`\`

\`spreadAtRest\`, \`spreadAtMax\` e velocidade de referência são parâmetros de calibração (definidos por medições reais). O braço parado deve continuar com brilho mínimo, mas o movimento deve aumentar de forma observável.

## 7. Algoritmo A-04 — criar linhas elétricas ancoradas no esqueleto

\`\`\`pseudocode
FUNÇÃO gerarPolylineBraco(shoulder,elbow,wrist,nSamples):
    SE pontos inválidos: RETORNAR lista vazia
    interpolar trecho shoulder->elbow com nSamples/2 amostras
    interpolar trecho elbow->wrist com nSamples/2 amostras
    RETORNAR pontos ordenados de proximal para distal
FIM_FUNÇÃO

FUNÇÃO criarContornoEletrico(polyline,offsetCss,seed,time):
    PARA i=0..length-2:
        tangent <- normalize(polyline[i+1]-polyline[i])
        SE magnitude muito pequena:
            pular segmento para evitar divisão por zero
        normal <- {x:-tangent.y,y:tangent.x}
        jitter <- noise(seed,i,time)*offsetCss*limitedAmplitude
        leftCurvePoint <- polyline[i]+normal*(offsetCss+jitter)
        rightCurvePoint <- polyline[i]-normal*(offsetCss+jitter)
        INSERIR nos buffers de linhas do lado
    FIM_PARA
    RETORNAR geometrias pré-alocadas com versão do frame
FIM_FUNÇÃO

FUNÇÃO gerarTroncoEletrico(joints,scale):
    construir linhas suaves próximas a shoulderCenter,ombros e hipCenter
    usar deslocamento limitado por escala corporal
    se hip inválido, somente traço de ombros/parte superior
    NUNCA renderizar contorno estático de corpo sem landmarks
FIM_FUNÇÃO
\`\`\`

A geometria pode ser construída como \`LineSegments\`, ribbons de triângulos ou shader. Prefira ribbons para controlar espessura na projeção; CPU pode atualizar buffer tipado pequeno, não milhares de objetos JS por quadro.

## 8. Algoritmo A-05 — ramificações, partículas e glow

\`\`\`pseudocode
FUNÇÃO criarRamosEletricos(side,polyline,intensity,quality):
    maxBranches <- config de perfil
    PARA branchId até maxBranches:
        seed <- PRNG determinístico inicial(branchId)
        origem <- amostra da polyline por seed
        direção <- tangente local combinada com normal
        comprimento <- CLAMP(seed.length*scale*intensity,min,max)
        PONTOS <- 3..6 vértices com jitter bounded
        atributo alpha <- intensity*fade*branchEnvelope
        escrever no pool de segmentos existente
    FIM_PARA
FIM_FUNÇÃO

FUNÇÃO atualizarParticulasAura(params,quality,time):
    para cada instância até budget:
        escolher âncora de braço/tronco válida proporcional à intensidade
        interpolar posição ao longo do segmento anatômico
        acrescentar displacement curto radial/tangencial procedural
        atualizar cor/tamanho/alpha por intensidade e fase
    se braço LEFT perdido:
        não emitir novas partículas a partir de LEFT
    se braço RIGHT válido:
        manter resposta de RIGHT independente
FIM_FUNÇÃO

FUNÇÃO aplicarGlow():
    cores: violeta/azul elétrico com núcleo branco controlado
    alpha externo precisa ser zero, preservar vídeo
    reduzir pós-processamento no perfil Compatibilidade
    não usar flash fullscreen repetitivo que comprometa leitura corporal
FIM_FUNÇÃO
\`\`\`

## 9. Algoritmo A-06 — update por frame e ausência parcial

\`\`\`pseudocode
FUNÇÃO AuraEffect.update(now,dt,snapshot):
    SE modo != AURA OU plugin desativado: ocultar e retornar
    joints <- extrairJuntasPose(snapshot,geometry)

    SE joints.shoulders válidos:
        paramsBase <- calcularBaseCorporal(joints)
        phaseTorso <- trackingMachineTorso.update(valid=torsoValid,now)
    SENÃO:
        phaseTorso <- trackingMachineTorso.update(valid=false,now)
    FIM_SE

    PARA side em LEFT,RIGHT:
        armValid <- joints[side].shoulder/elbow/wrist válidos
        phase[side] <- trackingMachine[side].update(armValid,now)
        SE phase[side]=ACTIVE:
            intensity[side] <- calcularIntensidadeBraco(...)
            pontosSuaves[side] <- smoothPoints(...)
            atualizar polylines e ramificações daquele lado
        SENÃO_SE phase[side]=LOST_GRACE:
            manter últimas curvas daquele lado sem mover; rotular obsoletas
        SENÃO_SE phase[side]=FADING:
            reduzir alpha daquele lado até zero
        SENÃO:
            ocultar curvas daquele lado e emitir zero partículas novas
        FIM_SE
    FIM_PARA

    atualizar tronco independentemente com phaseTorso
    compor intensidade total para halo secundário
    escrever uniformes/buffers sem criar novos THREE objetos por frame
FIM_FUNÇÃO
\`\`\`

O usuário pode perder um punho do quadro: a aura desse braço desaparece, mas a outra parte continua funcional se tiver landmarks suficientes.

## 10. Algoritmo A-07 — presets e descarte

\`\`\`pseudocode
FUNÇÃO AuraEffect.applyQuality(profile):
    selecionar tamanho do pool:
        HIGH=2200; MEDIUM=1100; COMPAT=250 partículas
    selecionar amostras por braço:
        HIGH=32; MEDIUM=16; COMPAT=8
    limitar ramos, glow e buffer de geometria conforme orçamento
    RECRIAR recursos somente quando a capacidade realmente mudar
    PRESERVAR tracking states, pose snapshots e peer RTC
FIM_FUNÇÃO

FUNÇÃO AuraEffect.dispose():
    desabilitar update/render, revogar referencias temporárias
    liberar buffers/materiais/texturas exclusivos de AURA
    NÃO destruir renderer global, MediaPipe nem RTCPeerConnection
FIM_FUNÇÃO
\`\`\`

## 11. Estados, falhas e concorrência

\`\`\`text
Pose real -> shoulder/arm joints -> transformação geométrica
     -> Torso: OFF/ACQUIRING/ACTIVE/LOST_GRACE/FADING
     -> LeftArm: OFF/ACQUIRING/ACTIVE/LOST_GRACE/FADING
     -> RightArm: OFF/ACQUIRING/ACTIVE/LOST_GRACE/FADING
     -> composição transparente em um único RendererLifecycle
\`\`\`

| Condição | Comportamento |
| --- | --- |
| Só braço direito detectado | aura à direita, sem imitar esquerda |
| Só braço esquerdo detectado | aura à esquerda, sem imitar direita |
| Ombros incompletos | ocultar parâmetros dependentes da largura, preservar vídeo |
| Quadris ausentes | traço superior do tronco com qualidade reduzida |
| Pessoa caminha lateralmente | todo conjunto desloca com landmarks reais |
| Pose some 100ms | grace antes de fade, sem teleporte |
| Pose some >400ms | fade de tronco/braços, nunca ficar fixa |
| Pessoa reaparece | reacquisition estável, não saltar |
| Braço move rapidamente | limitador e suavização equilibram velocidade e tremor |
| Vista espelhada | usar coordenadas da #4 sem inverter semântica duas vezes |
| Performance baixa | perfil Compatibilidade mantém rastreio e reduz VFX |
| GPU falha | vídeo segue visível, aura desativada com mensagem |

## 12. Pseudocódigo de testes

\`\`\`pseudocode
SUITE AuraSkeleton:
    extrair índices 11,12,13,14,15,16,23,24 corretamente
    visibility < threshold invalida só junta afetada
    shoulderWidth zero -> INVALID_SCALE
    sem quadril -> torso parcial, sem inventar quadril
    espelhamento -> pontos seguem deslocamento correto na projeção
    NaN em uma junta não contamina buffer inteiro
FIM_SUITE

SUITE IntensidadeIndependente:
    mover somente leftWrist:
        leftIntensity aumenta e rightIntensity permanece estável
    mover somente rightWrist:
        rightIntensity aumenta e leftIntensity permanece estável
    afastar ambos os punhos:
        totalIntensity cresce dentro do clamp
    distância de câmera muda, normalização por shoulderWidth
        conserva escala aproximada da intensidade
    dt=0, dt excessivo -> sem divisão por zero ou salto
FIM_SUITE

SUITE GeometriaEletrica:
    shoulder->elbow->wrist produz curva ancorada em três pontos
    segmentos degenerados não produzem NaN
    ao mover wrist x+100 CSS px, ponta do ramo desloca-se corretamente
    budget COMPAT < HIGH em linhas/ramos/partículas
    nenhuma GPU buffer alocada a cada frame de atualização
FIM_SUITE

SUITE TrackingStates:
    losing LEFT -> LEFT entra LOST_GRACE/FADING
                   RIGHT continua ACTIVE
    corpo some >400ms -> torso, LEFT e RIGHT entram fade
    return within grace -> retomar com alpha suave
    switch AURA->NONE->AURA preserva peer RTC e um loop RAF
FIM_SUITE

SUITE Física (não simular aprovação):
    câmera real mostra pessoa com dois braços
    levantar somente um lado e confirmar efeito separado
    abrir ambos braços e caminhar lateralmente
    sair de quadro e voltar; observar fade
    operar por 2 minutos, medir FPS real
    registrar hardware, iluminação e evidências ou marcar pendente
FIM_SUITE
\`\`\`

## 13. Aceite e negative prompt

**Pronto quando:** efeito elétrico acompanha ombros, tronco e braços reais; cada braço controla seu efeito de forma independente; velocidade e abertura alteram energia; perda parcial/total faz fade; qualidade gráfica reduz custo real; mudanças de modo não afetam WebRTC; testes verificam geometria, estados e recursos. Documentar arquivos/relações no grafo JSON.

**Não entregar:** contorno estático com filtros CSS, gravação de relâmpagos, vídeo/gif pronto, exigência de segmentação perfeita, reconstrução volumétrica 3D, mesmo efeito idêntico nos dois braços quando só um mexe, imagens enviadas a IA externa, FPS fictício, leiturade pose por timestamp antigo como se atual.

**Handoff para #9:** todos três plugins ENERGY, PORTAL, AURA estão descritos com a mesma API de modo/qualidade/estado. A operação de palco e recuperação será consolidada na próxima issue.
