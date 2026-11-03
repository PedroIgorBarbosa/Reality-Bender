# REALITY BENDER — Issue #4: projeção ao vivo e transformação espacial

**Versão:** 1.0 · **Issue:** https://github.com/PedroIgorBarbosa/Reality-Bender/issues/4  
**Contrato superior:** \`docs/REALITY_BENDER_ERS_v1.0.md\` · **Dependência:** #3  
**RF:** RF-10, RF-11, RF-21, RF-22, RF-23 · **RNF:** RNF-02, RNF-06, RNF-12.

## 1. Resultado esperado e fronteira

\`/stage\` deverá exibir o \`MediaStream\` recebido pela #3, com proporção correta em retrato/paisagem e uma camada WebGL2 transparente exatamente alinhada com os pixels do vídeo. Um único transformador geométrico converterá landmarks normalizados para posições da projeção. Tela cheia, espelhamento, redimensionamento, modos e qualidade gráfica terão interfaces funcionais, sem inventar efeitos antes das issues #6–#8.

**Invariantes:** vídeo é a camada real mais baixa; canvas tem \`pointer-events:none\`; a câmera não reinicia ao alterar fullscreen/qualidade/modo; o espelhamento acontece uma vez; coordenadas CSS não são confundidas com pixels de framebuffer; quando não há vídeo não permanece frame congelado rotulado “Ao vivo”.

## 2. Organização de módulos

\`\`\`text
src/client/stage/StageComposition.tsx
src/client/stage/RemoteVideoLayer.tsx
src/client/stage/StageHud.tsx
src/client/stage/StageControls.tsx
src/client/stage/FullscreenController.ts
src/client/stage/VideoGeometry.ts          # matemática pura
src/client/stage/StageViewportObserver.ts # resize + metadados
src/client/stage/StageModeController.ts
src/client/render/RendererLifecycle.ts
src/client/render/QualityProfiles.ts
src/client/render/DiagnosticOverlay.ts
tests/unit/video-geometry.test.ts
tests/unit/quality-profiles.test.ts
tests/ui/stage-fullscreen.test.tsx
tests/ui/stage-modes.test.tsx
\`\`\`

Reusar stream/estado da #3 e eventos autorizados \`stage:set-mode\` da #2; não duplicar pipeline RTC nem listeners de tela.

## 3. Contratos geométricos e visuais

\`\`\`pseudocode
TIPO VideoDimensions = {widthPx:inteiro>0, heightPx:inteiro>0}
TIPO StageDimensions = {cssWidth:real>0, cssHeight:real>0, dpr:real>0}
TIPO GeometryConfig = {
    fit: "contain" | "cover",
    mirrored: boolean,
    orientationFromDecodedVideo: "native" | "explicit"
}
TIPO ContentRect = {left,top,width,height,scale}  // unidades CSS px
TIPO NormalizedPoint = {x:real,y:real}              // imagem decodificada [0,1]
TIPO CssPoint = {x:real,y:real}                     // origem no container
TIPO NdcPoint = {x:real,y:real}                     // WebGL [-1,+1]
TIPO RenderQuality = HIGH | MEDIUM | COMPAT
TIPO EffectMode = NONE | ENERGY | PORTAL | AURA
TIPO StageStatus = NO_SESSION | WAITING | PAIRED | NEGOTIATING
                 | LIVE | INTERRUPTED | WEBGL_UNAVAILABLE
FIM_TIPOS

QUALITY_PROFILE HIGH:
    renderScale=1.0; pixelRatioCap=2; particleBudget=4096;
    bloomEnabled=true
QUALITY_PROFILE MEDIUM:
    renderScale=0.75; pixelRatioCap=1.5; particleBudget=2048;
    bloomEnabled=true
QUALITY_PROFILE COMPAT:
    renderScale=0.5; pixelRatioCap=1; particleBudget=512;
    bloomEnabled=false
FIM

NOTA:
    particleBudget é contrato futuro para efeitos, não comprovação de
    partículas implementadas. Nesta issue, mudança de renderScale/
    pixelRatio precisa ser observável no renderer.
FIM
\`\`\`

## 4. Algoritmo G-01 — medir a área real de exibição

\`\`\`pseudocode
FUNÇÃO medirGeometria(videoElement, stageElement, canvasElement, quality):
    videoWidth <- videoElement.videoWidth
    videoHeight <- videoElement.videoHeight
    SE videoWidth <=0 OU videoHeight <=0:
        RETORNAR {valid:false,reason:"VIDEO_DIMENSIONS_UNAVAILABLE"}
    FIM_SE

    stageRect <- stageElement.getBoundingClientRect()
    cssWidth <- stageRect.width; cssHeight <- stageRect.height
    SE width <=0 OU height <=0:
        RETORNAR {valid:false,reason:"STAGE_NOT_LAID_OUT"}
    FIM_SE

    dprReal <- window.devicePixelRatio OU 1
    dprLimitado <- MIN(dprReal, quality.pixelRatioCap)
    framebufferWidth <- ARREDONDAR(cssWidth * dprLimitado * quality.renderScale)
    framebufferHeight <- ARREDONDAR(cssHeight * dprLimitado * quality.renderScale)
    GARANTIR framebufferWidth/Height >=1 e <= WebGL MAX_RENDERBUFFER_SIZE
    DEFINIR renderer.setSize(cssWidth, cssHeight, false)
    DEFINIR renderer.setPixelRatio(dprLimitado * quality.renderScale)
    RETORNAR snapshot imutável com dimensões, fit, mirror e viewportVersion
FIM_FUNÇÃO
\`\`\`

Importante: não aplicar o fator DPR novamente no cálculo das landmarks. O renderer converte espaço CSS de tela para framebuffer internamente.

## 5. Algoritmo G-02 — calcular \`object-fit\` com barras ou corte

\`\`\`pseudocode
FUNÇÃO calcularRetanguloVideo(videoW,videoH,stageW,stageH,fit):
    VALIDAR dimensões finitas e >0
    SE fit="contain":
        scale <- MIN(stageW/videoW, stageH/videoH)
    SENÃO_SE fit="cover":
        scale <- MAX(stageW/videoW, stageH/videoH)
    SENÃO:
        ERRO INVALID_FIT
    FIM_SE

    contentW <- videoW*scale
    contentH <- videoH*scale
    offsetX <- (stageW-contentW)/2
    offsetY <- (stageH-contentH)/2

    RETORNAR {left:offsetX, top:offsetY,
             width:contentW,height:contentH,scale}
FIM_FUNÇÃO

EXEMPLO_CONTAIN:
    video=1280x720, stage=1024x768
    scale=0.8
    rect={left:0,top:96,width:1024,height:576}

EXEMPLO_RETRATO_CONTAIN:
    video=720x1280, stage=1024x768
    scale=0.6
    rect={left:296,top:0,width:432,height:768}
FIM
\`\`\`

É obrigatório usar o mesmo \`fit\` no elemento de vídeo e no transformador. Preferir \`contain\` para apresentação porque mostra corpo inteiro; \`cover\` só se os testes de clipping forem explícitos.

## 6. Algoritmo G-03 — normalizado → CSS → NDC

\`\`\`pseudocode
FUNÇÃO videoNormalizedToStage(point, geometry):
    VALIDAR point.x, point.y finitos
    SE point fora [0,1]:
        RETORNAR INVALID_POINT (não clamp silencioso de NaN)
    FIM_SE
    rect <- calcularRetanguloVideo(geometry.video,geometry.stage,geometry.fit)

    xNorm <- point.x
    SE geometry.mirrored:
        xNorm <- 1 - xNorm
    FIM_SE

    cssX <- rect.left + rect.width*xNorm
    cssY <- rect.top  + rect.height*point.y

    SE fit=cover e posição cair fora da área visível:
        RETORNAR {x:cssX,y:cssY,visible:false}
    SENÃO:
        RETORNAR {x:cssX,y:cssY,visible:true}
    FIM_SE
FIM_FUNÇÃO

FUNÇÃO stageCssToNdc(css,stage):
    xNdc <- 2*(css.x/stage.cssWidth)-1
    yNdc <- 1-2*(css.y/stage.cssHeight)
    RETORNAR {x:xNdc,y:yNdc}
FIM_FUNÇÃO

FUNÇÃO ndcToStageCss(ndc,stage):
    xCss <- (ndc.x+1)*stage.cssWidth/2
    yCss <- (1-ndc.y)*stage.cssHeight/2
    RETORNAR {x:xCss,y:yCss}
FIM_FUNÇÃO
\`\`\`

A orientação da imagem deve ser determinada pelas dimensões do frame **já decodificado** (videoWidth/videoHeight). Não rotacionar novamente com base em \`screen.orientation\` sem evidência; isso causaria dupla rotação.

## 7. Algoritmo G-04 — alinhar camadas sem dupla inversão

\`\`\`pseudocode
COMPONENTE StageComposition(remoteStream):
    elementoStage <- DIV posicionado, overflow hidden, fundo escuro
    video <- VIDEO absolute inset 0; width=100%;height=100%;
                    object-fit="contain"; transform=
                    mirrored ? "scaleX(-1)" : "none"
    overlay <- CANVAS absolute inset 0; width=100%;height=100%;
                      background transparent;pointer-events none

    ASSIGN video.srcObject=remoteStream
    INSTALAR ResizeObserver no container
    OUVIR video.loadedmetadata e video.resize quando disponível
    AO resize, metadata, orientation-change ou fullscreenchange:
        novo <- medirGeometria(video,container,renderer,quality)
        SE geometry mudou: atualizar snapshot e projeção do renderer
    FIM

    CONFIGURAR coordenadas dos efeitos SOBRE o canvas sem outro CSS mirror
    NÃO aplicar scaleX simultâneo no canvas e nas posições transformadas
    PARA pontos diagnosticados:
        converter videoNormalizedToStage() com mirrored
        desenhar alvo na posição retornada sem transformação extra
    FIM

    SE stream inativo:
        video.srcObject=null
        NÃO reter textura/frame antigo em overlay
        MOSTRAR overlay de "Sinal interrompido"
    FIM_SE
FIM_COMPONENTE
\`\`\`

\`StageComposition\` deve usar uma única versão de geometria por frame, evitando capturar snapshots diferentes entre vídeo e efeitos.

## 8. Algoritmo G-05 — ciclo de vida do renderer Three.js

\`\`\`pseudocode
FUNÇÃO criarRenderer(canvas,quality):
    SE WebGL2 não disponível:
        RETORNAR erro tipado WEBGL2_UNAVAILABLE
    FIM_SE

    renderer <- new THREE.WebGLRenderer({
        canvas, alpha:true, antialias:quality != COMPAT,
        premultipliedAlpha:true, powerPreference:"high-performance"
    })
    renderer.setClearColor(COR_PRETA, alpha=0) // vídeo fica visível por trás
    scene <- new THREE.Scene()
    camera <- new THREE.OrthographicCamera(...)
    recursos <- RegistroDeRecursos()
    frameId <- null
    lastTimestamp <- null

    FUNÇÃO frame(timestamp):
        SE disposed ou contextLost: RETORNAR
        dt <- CLAMP((timestamp-lastTimestamp)/1000,0,0.05)
        lastTimestamp <- timestamp
        ATUALIZAR camera/viewport se geometryVersion mudou
        ATUALIZAR efeitos ativos quando existirem; NONE não desenha efeito
        renderer.clear()
        renderer.render(scene,camera)
        frameId <- requestAnimationFrame(frame)
    FIM

    INSTALAR webglcontextlost:
        evento.preventDefault()
        CANCELAR frameId
        MOSTRAR aviso "WebGL interrompido"; vídeo RTC permanece
    INSTALAR webglcontextrestored:
        RECRIAR apenas buffers/texturas perdidos e retomar render
    INICIAR loop único com requestAnimationFrame(frame)

    RETORNAR {renderer,scene,camera,updateQuality,dispose}
FIM_FUNÇÃO

FUNÇÃO dispose():
    CANCELAR frameId, remover listeners e ResizeObserver
    PARA recurso GPU registrado: geometry.dispose / material.dispose etc
    renderer.dispose()
    DESVINCULAR canvas, eliminar referências
FIM_FUNÇÃO
\`\`\`

Não criar uma nova instância de \`WebGLRenderer\` para cada efeito, alteração de dimensão ou frame.

## 9. Algoritmo G-06 — modos, atalhos, qualidade e tela cheia

\`\`\`pseudocode
FUNÇÃO solicitarModo(mode):
    VALIDAR mode ∈ {NONE,ENERGY,PORTAL,AURA}
    VALIDAR que Stage é proprietário OU Control autorizado pelo servidor
    ENVIAR stage:set-mode com seqId e confirmação
    AGUARDAR status broadcast autorizado
    ATUALIZAR estado compartilhado SEM reiniciar peer RTC
    SE efeito ainda não implementado:
        MOSTRAR "Modo selecionado; efeito depende da Issue #6/#7/#8"
        NÃO declarar que renderizou um efeito
    FIM_SE
FIM_FUNÇÃO

OUVIR keydown(event):
    SE event.target for input/textarea/select/contentEditable: IGNORAR
    MAPEAR "0"→NONE; "1"→ENERGY; "2"→PORTAL; "3"→AURA
    MAPEAR "f"→alternarFullscreen
    MAPEAR "d"→alternarDiagnostico
    IGNORAR key repeat quando causa alteração redundante
    PREVENIR atalhos enquanto modal crítico aberto
FIM

FUNÇÃO alternarFullscreen():
    AO clique/tecla confiável do usuário:
        SE document.fullscreenElement:
            AGUARDAR document.exitFullscreen()
        SENÃO:
            AGUARDAR stageElement.requestFullscreen()
        FIM_SE
    CAPTURAR rejeição -> erro "FULLSCREEN_REJECTED"
    AO fullscreenchange -> recalcular geometria e posição de overlay
FIM_FUNÇÃO

FUNÇÃO alterarQualidade(profile):
    VALIDAR profile
    ATUALIZAR renderScale, DPR cap e bloomEnabled
    RECONFIGURAR buffer renderer e emitir evento local qualityChanged
    EXIGIR que efeito futuro respeite particleBudget
    VERIFICAR que conexão RTC, srcObject e negociação não mudaram
FIM_FUNÇÃO
\`\`\`

## 10. Algoritmo G-07 — diagnóstico geométrico sem fingir rastreamento

\`\`\`pseudocode
COMPONENTE DiagnosticOverlay():
    SOMENTE visível com diagnóstico ligado
    LABEL obrigatório "Alvos sintéticos de geometria — sem MediaPipe"
    PONTOS_TESTE = [(0,0),(1,0),(0,1),(1,1),(0.5,0.5),
                    (0.25,0.75)]
    PARA cada ponto:
        converter videoNormalizedToStage(p,geometry)
        DESENHAR pequeno marcador em CSS coordinates
        SE não visível (cover): registrar como clipped
    FIM_PARA
    MOSTRAR:
        video.videoWidth/Height
        stageCssWidth/Height
        rect.left/top/width/height
        DPR real e DPR aplicado
        mirror flag e fit escolhido
        estado RTC recebido da #3
    NÃO usar overlay sintético como comprovação de rastreamento real
FIM_COMPONENTE
\`\`\`

## 11. Máquina de estados e concorrência

\`\`\`text
Stage.NO_VIDEO -> Stage.HAS_VIDEO -> Stage.FULLSCREEN/NORMAL
      |                |
      |                +-- toggle mirror -> reproject landmarks
      |                +-- resize -> update geometry
      |                +-- change quality -> resize renderer
      |                +-- select mode -> stage:set-mode
      v
Stage.INTERRUPTED -> NO_VIDEO (srcObject removido quando stream encerra)
Renderer.READY -> Renderer.CONTEXT_LOST -> RESTORING -> READY
                          |
                          +-> UNAVAILABLE (vídeo permanece visível)
\`\`\`

- \`ResizeObserver\`, \`fullscreenchange\`, \`loadedmetadata\` e \`video.resize\` podem acontecer na mesma sequência: agrupar leituras e aplicar uma atualização de geometria por animation frame, com \`geometryVersion\`.
- Alterar modo e qualidade durante conexão WebRTC não deve tocar no \`RTCPeerConnection\`.
- React StrictMode pode montar duas vezes; toda inscrição possui cleanup idempotente.
- Configuração de espelhamento é estado de projeção, não mutação dos landmarks brutos da #5.

## 12. Falhas e fluxos alternativos

| Condição | Tratamento |
| --- | --- |
| Stream nula | mostrar \`Aguardando vídeo\`, não renderizar efeito |
| Dimensões 0/NaN | retornar \`INVALID_GEOMETRY\`, aguardar metadados |
| Portrait → landscape | reavaliar retângulo e projeção sem reiniciar RTC |
| DPR ou tela cheia muda | recalcular framebuffer e rect CSS, sem dupla escala |
| WebGL2 ausente | mostrar vídeo normal + aviso, não tela branca |
| Contexto WebGL perdido | parar RAF, tentar restaurar, manter vídeo |
| Fullscreen rejeitado | informar e manter janela normal |
| Comando de modo não autorizado | não alterar estado compartilhado |
| Vídeo perde quadros | esconder status live, mostrar erro #3 |
| Perfil Compatibilidade | reduzir efetivamente framebuffer, sem botão inerte |

## 13. Pseudocódigo de testes determinísticos

\`\`\`pseudocode
SUITE VideoGeometry:
    ASSERT fitContain(1280,720,1024,768) == {x:0,y:96,w:1024,h:576}
    ASSERT map((0.5,0.5)) == (512,384)
    ASSERT fitContain(720,1280,1024,768) == {x:296,y:0,w:432,h:768}
    ASSERT map((0.0,0.5)) == (296,384)
    ASSERT mirrored map((0.25,0.5)) = unmirrored map((0.75,0.5))
    ASSERT cssToNdc((0,0),(1024,768)) == (-1,+1)
    ASSERT cssToNdc((1024,768),(1024,768)) == (+1,-1)
    ASSERT NDC roundtrip de 100 pontos aleatórios tolerância < 1e-6
    ASSERT fitCover gera clipping reconhecido
    ASSERT x ou y NaN -> erro, nunca coordenada 0 silenciosa
FIM_SUITE

SUITE Renderer:
    MONTAR stage com vídeo mockado e ambiente de renderer controlado
    ALTERAR quality HIGH→COMPAT:
        ASSERT framebuffer reduz efetivamente
    ALTERAR mirror duas vezes:
        ASSERT volta a posição inicial sem desvio
    SIMULAR 10 resizes:
        ASSERT só um loop requestAnimationFrame ativo
    SIMULAR contextlost:
        ASSERT renderer suspende, vídeo permanece
    DESMONTAR:
        ASSERT listeners e resources liberados
FIM_SUITE

SUITE IntegrationAndUI:
    /stage renderiza estado correto quando stream real está ausente
    modo muda por stage:set-mode autorizado e não recria RTCPeerConnection
    atalhos 0–3 respeitam inputs focados e modal
    tecla F aciona requestFullscreen quando browser permite
    tecla D revela alvos identificados como sintéticos
    tela cheia e mudança de orientação não deformam vídeo
FIM_SUITE

SUITE Física (pendente até execução):
    PC com data-show, Android vertical e horizontal
    Testar vídeo em 16:9 e 9:16, inclinação, espelhamento, resize
    Validar que overlay coincide com pontos conhecidos visualmente
    Registrar se foi executado, nunca simular aprovação
FIM_SUITE
\`\`\`

## 14. Critérios de aceite, rastreabilidade e negative prompt

**Evidências obrigatórias:** vídeo em \`/stage\` mantém proporção e reage ao stream real; transformações com casos numéricos; tela cheia; mudança de qualidade que realmente reduz renderScale; diagnóstico com pontos **explicitamente sintéticos**; WebGL2 ou fallback honesto; sem alteração de track/RTC ao trocar controles. Registrar os arquivos e suas relações no grafo JSON conforme \`AGENTS.md\`.

**Não entregar:** rotação dupla, posicionamento com constantes mágicas de pixel, canvas substituindo stream de vídeo, mock se dizendo MediaPipe, vídeos exemplo, renderer criado por frame, fullscreen que só altera CSS sem utilizar API, controles de qualidade decorativos ou claims de FPS sem medição.

**Handoff para #5:** publicar API \`videoNormalizedToStage\` pura e versão de geometria coerente para que inferência MediaPipe use as mesmas coordenadas da projeção.
