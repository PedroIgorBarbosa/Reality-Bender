# REALITY BENDER — Issue #10: homologação integral e roteiro de apresentação

**Versão:** 1.0 · **Issue:** https://github.com/PedroIgorBarbosa/Reality-Bender/issues/10  
**Contrato superior:** \`docs/REALITY_BENDER_ERS_v1.0.md\` · **Dependências:** #1 a #9.  
**Rastreabilidade:** CT-01 a CT-18, RF P0 (todos), RNF-01 a RNF-20.

## 1. Resultado e definição de responsabilidade

Comprovar objetivamente se o produto inteiro funciona **com celular físico, PC, data-show e movimentos reais**, em rede adequada, com três efeitos. Gerar matriz de evidências CT-01–CT-18, executar build/CI, configurar HTTPS/WSS de forma reproduzível, medir FPS e duração de inferência e, quando houver equipamento, latência física motion-to-photon. Registrar falhas e pendências sem afirmar aprovação fictícia.

**Invariantes:** (I1) teste não executado ≠ aprovado; (I2) mock/teste automatizado ≠ validação da câmera física; (I3) imagens pré-gravadas não comprovam vídeo ao vivo; (I4) métricas sem origem e hardware são inválidas; (I5) TLS confiável e autorização de sessão são obrigatórios; (I6) não resolver falha apagando teste ou relaxando a ERS; (I7) produto só é concluído com todos RF P0 verificados.

## 2. Arquivos e artefatos de evidência

\`\`\`text
docs/qa/TEST-PLAN.md                  # plano e pré-condições
docs/qa/TEST-RESULTS.md               # resultados observados, sem preenchimento fictício
docs/qa/TEST-MATRIX.json              # CT-01..18, status e evidência
docs/qa/HTTPS-SETUP.md                # setup seguro para celular e WSS
docs/qa/PRESENTATION-RUNBOOK.md        # roteiro com recovery e planos de contingência
docs/qa/HARDWARE-REPORT.md             # hardware, navegador, Wi-Fi, GPU e limites
scripts/qa/smoke-server.mjs            # valida rotas do build real
scripts/qa/verify-contracts.mjs        # valida cobertura e requisitos essenciais
tests/e2e/                            # testes de navegador automatizados possíveis
.github/workflows/ci.yml              # build/lint/typecheck/test/smoke
README.md                             # comandos efetivamente verificados
\`\`\`

Evidências como screenshots ou gravações não substituem os resultados funcionais. Nunca versionar vídeo bruto da câmera, credenciais, SDP/ICE, IPs privados desnecessários ou dados de terceiros; redigir/limpar antes de registrar.

## 3. Contrato de matriz e evidências

\`\`\`pseudocode
ENUM TestStatus = NOT_RUN | PASS | FAIL | BLOCKED
TIPO TestEvidence:
    id: "CT-01" ... "CT-18"
    requirementIds: string[]
    status: TestStatus
    environment: "unit"|"integration"|"browser"|"physical"
    executedAt: ISO_DATETIME|null
    operator: string|null
    commands: string[]
    observedResult: texto|null
    expectedResult: texto
    artifacts: caminhos locais/links de log redigidos[]
    blockerReason: texto|null
    notes: texto
FIM_TIPO

FUNÇÃO inicializarMatriz():
    PARA id in CT-01..CT-18:
        CRIAR entrada com status=NOT_RUN
        executedAt=null, observedResult=null, artifacts=[]
        expectedResult da ERS, requirementIds derivados da matriz existente
    FIM
    NÃO preencher status PASS por padrão
FIM_FUNÇÃO

FUNÇÃO registrarExecucao(testCase, observations):
    VALIDAR testCase.id existente e status permitido
    SE status=PASS OU FAIL:
        EXIGIR executedAt não nulo
        EXIGIR observedResult explícito e evidência mínima apropriada
    FIM_SE
    SE status=BLOCKED:
        EXIGIR blockerReason
    FIM_SE
    NÃO permitir PASS em ambiente "physical" quando nenhum equipamento
        real tiver sido utilizado
    SALVAR resultado sem segredos ou dados corporais
FIM_FUNÇÃO
\`\`\`

A matriz deve guardar **qual ambiente** comprovou o resultado. Um teste unitário pode passar e seu correspondente físico continuar NOT_RUN.

## 4. Algoritmo Q-01 — pré-validação de repositório e dependências

\`\`\`pseudocode
FUNÇÃO verificarFundacao():
    LER AGENTS.md, ERS, index do grafo e subgrafo relevante
    CONFIRMAR existência dos módulos das issues #1–#9 no Git atual
    CONFIRMAR que docs/specs/ISSUE-001..010 existem
    LER manifests/scripts e configuração real
    TESTAR em ambiente limpo:
        npm ci
        npm run lint
        npm run typecheck
        npm run test
        npm run build
    PARA cada comando:
        CAPTURAR código de saída, data/hora, plataforma e log sanitizado
        SE exit != 0:
            ABRIR defeito, priorizar correção, NÃO marcar etapa como PASS
        FIM_SE
    FIM_PARA
    EXECUTAR npm run start contra dist final (não só dev)
    VERIFICAR via HTTP:
        GET /api/health -> 200 + contrato JSON
        GET /stage -> HTML da aplicação
        GET /control -> HTML da aplicação
        GET /api/rota-inexistente -> 404 JSON
        GET /rota-inexistente -> SPA 404 visível após executar JS
    ENCERRAR processo de forma limpa
FIM_FUNÇÃO
\`\`\`

CI não substitui a homologação física, mas uma aplicação que não compila não pode ser homologada. Usar versões concretas do lockfile; nunca desabilitar lint/typecheck para forçar verde.

## 5. Algoritmo Q-02 — disponibilizar HTTPS/WSS confiável

\`\`\`pseudocode
FUNÇÃO prepararAcessoMovel():
    VALIDAR servidor está acessível localmente e rotas funcionam
    ESCOLHER um mecanismo com certificado TLS público confiável:
        túnel HTTPS persistente OU reverse proxy TLS com domínio válido
    CONFIGURAR PUBLIC_BASE_URL com HTTPS verdadeiro (sem '/' final indevido)
    CONFIGURAR CLIENT_ORIGINS com origens exatas dos navegadores usados
    CONFIGURAR proxy de /socket.io incluindo Upgrade WebSocket,
        encaminhando o mesmo processo Node e preservando segurança
    REINICIAR servidor se env precisou mudar

    TESTAR pelo celular:
        URL abre sem aviso de certificado inválido
        window.isSecureContext = true
        navigator.mediaDevices.getUserMedia existe
        WSS/Socket.IO conecta à mesma sessão de servidor
    FIM_TESTE

    ABRIR /stage no PC para criar sessão
    VALIDAR QR:
        aponta para PUBLIC_BASE_URL + "/control?invite=..."
        não contém http://192.168... nem http://localhost para celular
        convite ainda dentro de validade
    FIM_VALIDACAO

    NÃO instruir usuário a desabilitar safe browsing ou aceitar TLS inválido
    NÃO inserir credenciais TURN em frontend se não houver serviço planejado
FIM_FUNÇÃO
\`\`\`

A conexão HTTPS transporta o **sinalizador e a interface**, não converte automaticamente a mídia em relay. WebRTC deve estabelecer canal de mídia direto na LAN quando possível. Redes com isolamento entre clientes/NAT restrito podem exigir TURN e não devem ser declaradas compatíveis sem teste.

## 6. Algoritmo Q-03 — inventário e preparo do cenário físico

\`\`\`pseudocode
FUNÇÃO prepararApresentacao():
    COLETAR:
        telefone.modelo, OS, versão Chrome
        PC.CPU,GPU,RAM,OS, navegador e versão
        rede.SSID (pode anonimizar), LAN/isolamento,
             roteador se necessário para diagnóstico
        dataShow.resolução, conexão HDMI, modo espelho/estendido
        ambiente.iluminacao e posição da câmera
    VERIFICAR:
        computador conectado à projeção
        celular apoiado, câmera enquadra tronco e mãos
        Wi-Fi estável e dispositivos autorizados a se comunicar
        cabo e fonte/bateria são suficientes
    ANOTAR os dados no HARDWARE-REPORT sem dados pessoais sensíveis
    SE qualquer pré-condição ausente:
        marcar testes físicos dependentes como BLOCKED com razão
        NÃO preencher métricas por estimativa
    FIM_SE
FIM_FUNÇÃO
\`\`\`

## 7. Algoritmo Q-04 — matriz funcional CT-01 a CT-06

\`\`\`pseudocode
TESTE CT-01 "pareamento e vídeo":
    abrir /stage, gerar QR, entrar /control, clicar Iniciar câmera
    ESPERADO: sessão válida, câmera real no PC, estado live só com frame
    REQUISITOS: RF-01..RF-06, RF-08..RF-10
FIM_TESTE

TESTE CT-02 "negação de câmera":
    revogar permissão, tocar Iniciar
    ESPERADO: erro orientado sem iniciar mídia; tentar novamente via clique
    REQUISITOS: RF-04, RF-26
FIM_TESTE

TESTE CT-03 "segundo emissor":
    com CONTROL conectado, abrir mesmo convite em outro telefone
    ESPERADO: recusa e primeiro segue intacto
    REQUISITOS: RF-03
FIM_TESTE

TESTE CT-04 "vídeo imprevisível":
    mostrar objeto não utilizado nos testes/animacoes
    movê-lo em direções e velocidades distintas
    ESPERADO: mudanças equivalentes ao vivo no PC/data-show
    REQUISITOS: RF-08, RF-10
FIM_TESTE

TESTE CT-05 "esfera real":
    ativar ENERGY, duas mãos visíveis, aproximar/afastar
    ESPERADO: centro no meio; raio/brilho crescem aproximando
    REQUISITOS: RF-12,RF-14,RF-18
FIM_TESTE

TESTE CT-06 "portal real":
    ativar PORTAL, palma aberta, mover em quatro direções e girar
    ESPERADO: anel acompanha palma, orientação e abertura
    REQUISITOS: RF-12,RF-19
FIM_TESTE
\`\`\`

Todos exigem anotar **observado** antes de decidir PASS/FAIL. CT-01, CT-04–06 não podem ser concluídos apenas com webcam mockada.

## 8. Algoritmo Q-05 — matriz CT-07 a CT-12

\`\`\`pseudocode
TESTE CT-07 "aura unilateral e bilateral":
    ativar AURA, levantar braço esquerdo apenas, depois direito
    abrir ambos braços e mover tronco para lado
    ESPERADO: efeito segue juntas e intensidades independentes
    REQUISITOS: RF-13,RF-20
FIM_TESTE

TESTE CT-08 "troca e recursos":
    repetir 10 vezes NONE->ENERGY->PORTAL->AURA->NONE
    capturar contadores de resource ledger, WebGL e RTC
    ESPERADO: vídeo não interrompe, sem crescimento contínuo de recursos
    REQUISITOS: RF-17,RF-21,RNF-15
FIM_TESTE

TESTE CT-09 "perda de mão":
    ocultar mão por >400ms, recolocar no enquadramento
    ESPERADO: lost grace/fading, retorno sem salto
    REQUISITOS: RF-14,RF-15
FIM_TESTE

TESTE CT-10 "orientação e mirror":
    celular retrato/paisagem, ativar espelhamento e fullscreen
    ESPERADO: landmarks e efeito alinham ao vídeo sem distorção
    REQUISITOS: RF-11
FIM_TESTE

TESTE CT-11 "falha e recuperação Wi-Fi":
    desconectar Wi-Fi celular e restaurar
    ESPERADO: interrupção visível <=3s e reconexão funcional
    REQUISITOS: RF-09,RF-26
FIM_TESTE

TESTE CT-12 "qualidade real":
    alternar HIGH/MEDIUM/COMPAT
    medir framebuffer, contagem de instâncias, glow e FPS
    ESPERADO: custo gráfico reduzido, três efeitos mantêm reação
    REQUISITOS: RF-22
FIM_TESTE
\`\`\`

## 9. Algoritmo Q-06 — matriz CT-13 a CT-18

\`\`\`pseudocode
TESTE CT-13 "FPS por modo":
    executar 120s em ENERGY, 120s PORTAL, 120s AURA
    registrar FPS real em janelas de 1s, por modo e qualidade
    ESPERADO: >=30fps em >=95% das janelas por efeito (PC-alvo)
    REQUISITOS: RNF-02,RNF-04
FIM_TESTE

TESTE CT-14 "latência física":
    gravar 20 movimentos separados enquadrando pessoa e data-show
    com câmera externa 120/240fps quando disponível
    calcular ms entre início físico e reação projetada
    ESPERADO: reportar mediana/p95 reais; se sem câmera, NOT_RUN
    REQUISITOS: RNF-01
FIM_TESTE

TESTE CT-15 "encerramento":
    parar no celular, encerrar no PC, iniciar nova sessão
    ESPERADO: track.stop, peer.close e buffers liberados
    REQUISITOS: RF-06,RNF-15
FIM_TESTE

TESTE CT-16 "falhas específicas":
    convite inválido, modelo sem arquivo, WebGL ausente/context lost
    ESPERADO: causas/ações claras sem crash da aplicação
    REQUISITOS: RF-02,RF-26,RNF-20
FIM_TESTE

TESTE CT-17 "duas orientações":
    usar um mesmo celular alternando retrato/paisagem; ou dois aparelhos
    separadamente, um por sessão
    ESPERADO: landmarks alinhados e vídeo sem deformação
    REQUISITOS: RF-11
FIM_TESTE

TESTE CT-18 "privacidade e tráfego":
    examinar Network, permissões, storage, logs e conexões
    ESPERADO: sem upload de frames para IA, sem áudio/gravação,
              WSS/HTTPS e WebRTC, tokens não vazam em logs
    REQUISITOS: RNF-07,RNF-08
FIM_TESTE
\`\`\`

Além dos CT físicos, executar suites unitárias e de integração de cálculo, controle de sessão e reconexão. Teste automatizado de browser pode usar \`getUserMedia\` falso **somente** como verificação de UI/fluxo automatizado, com evidência marcada como simulada.

## 10. Algoritmo Q-07 — cálculo verdadeiro de FPS

\`\`\`pseudocode
FUNÇÃO avaliarFPS(frameTimestamps,modeStart,modeEnd):
    VALIDAR duração >=120000ms (pelo menos 2min)
    DEFINIR janelas consecutivas de 1000ms
    PARA cada janela:
        contar quadros realmente concluídos e renderizados
        fpsDaJanela <- quantidade de quadros da janela
        marcar pass se fpsDaJanela>=30
    FIM_PARA
    totalWindows <- numero janelas válidas (idealmente 120)
    goodWindows <- numero janelas com FPS>=30
    compliance <- goodWindows/totalWindows
    APROVAR RNF-02 SE compliance >=0.95
    RETORNAR {janelas,compliance,minFPS,medianFPS,hardwareInfo}
FIM_FUNÇÃO

REGRA:
    FPS solicitado ≠ FPS medido.
    Browser aba oculta/oclusão não representa projeção ativa;
    documentar se foi minimizado/pausado durante teste.
FIM
\`\`\`

O teste precisa usar o modo e perfil realmente habilitados no data-show. Se forem feitos ensaios de qualidade COMPAT, HIGH deve ter relatório separado.

## 11. Algoritmo Q-08 — latência física motion-to-photon

\`\`\`pseudocode
FUNÇÃO medirLatenciaFisica(videoExterno,framerateExterno,marcacoes):
    PRECONDICAO:
        cameraExterna capturou movimento real e data-show no MESMO vídeo
        framerateExterno = 120 ou 240 fps se disponível
        20 eventos distintos visíveis com início e reação correspondentes
    PARA cada evento i=1..20:
        frameMotion <- primeiro quadro de movimento da mão real
        frameVisual <- primeiro quadro em que efeito respondeu no data-show
        VALIDAR frameVisual>=frameMotion
        latencyMs[i] <- (frameVisual-frameMotion)*1000/framerateExterno
    FIM_PARA
    ordenar latencies crescente
    median <- média entre 10ª e 11ª medidas (para N=20)
    p95 <- latencies[CEIL(0.95*N)-1]   // nearest-rank: 19ª de 20
    result <- {
        medianMs:median,p95Ms:p95,minMs,maxMs,
        samples:20,cameraFramerate,dispositivos,rede,modo,qualidade
    }
    ACEITE_RNF01 <- median<=250ms E p95<=400ms
    OBJETIVO_ASPIRACIONAL <- latência<=150ms, não requisito relaxante
    RETORNAR result e evidência verificável
FIM_FUNÇÃO

SE vídeo externo ou quadros suficientes não disponíveis:
    status CT-14 <- NOT_RUN
    latenciaFisica <- "NÃO VALIDADA FISICAMENTE"
    NÃO substituir por RTCPeerConnection.getStats().roundTripTime
FIM
\`\`\`

Registrar definição da marcação e incerteza de um quadro de câmera (\`1000/framerateExterno\` ms). Não usar \`Date.now\` entre celular/PC como se os relógios estivessem sincronizados.

## 12. Algoritmo Q-09 — avaliar segurança e privacidade

\`\`\`pseudocode
FUNÇÃO auditoriaPrivacidadeOperacional():
    INSPECIONAR:
        getUserMedia solicita video=true,audio=false
        MediaStream.getAudioTracks().length=0
        HTTP/WSS para sinalização com origem autorizada
        WebRTC estabelece conexão cifrada e sessão exclusiva
        nenhum upload de snapshots da câmera para endpoints externos
        nenhum localStorage/IndexedDB/cookie com quadros ou landmarks
        nenhum log com inviteToken, resumeSecret, SDP/ICE bruto
        convites vencidos ou consumidos são recusados
        segundo emissor não expulsa o primeiro
        ao encerrar, câmera e conexões realmente terminam
    FIM_INSPECAO
    SE qualquer requisito de privacidade falhar:
        MARCAR CT-18 FAIL e bloquear aprovação final
FIM_FUNÇÃO
\`\`\`

Uma dependência de estáticos/modelos via CDN pode ser aceitável conforme ERS e licenças, mas não deve receber dados de câmera/pose. Preferir servir modelos localmente quando autorizado.

## 13. Algoritmo Q-10 — relatório e decisão de conclusão

\`\`\`pseudocode
FUNÇÃO consolidarHomologacao(matriz,rnfs,unitTests,build,hardware):
    VALIDAR existem exatamente CT-01..CT-18
    PARA cada CT:
        EXIGIR status e ambiente explícitos
        para PASS físico exigir evidência de execução real
    FIM_PARA

    todosP0 <- mapa RF P0 com implementado/testado/evidência
    todosCriticosPassam <- todos RF P0 verificados E
                           todos CT obrigatórios sem FAIL/NOT_RUN/BLOCKED
    buildOk <- npm ci,linter,typecheck,test,build,smoke aprovados
    fpsOk <- RNF-02 medido/aprovado no PC-alvo
    latenciaReportada <- CT-14 medida de verdade OU "NÃO VALIDADA"
    privacidadeOk <- CT-18 aprovado

    SE todosCriticosPassam E buildOk E fpsOk E privacidadeOk
       E latência dentro do critério quando mensurada:
        result <- "HOMOLOGADO"
    SENÃO:
        result <- "NÃO HOMOLOGADO"
        abrir lista de bloqueios com responsáveis e ações concretas
    FIM_SE

    GERAR TEST-RESULTS e HARDWARE-REPORT com evidência do Git atual
    NÃO apresentar "produto pronto" se demonstração física não foi feita
    REGISTRAR limitações de rede, iluminação e compatibilidade
    RETORNAR relatório final verificável
FIM_FUNÇÃO
\`\`\`

Para respeitar a conclusão formal da ERS, a latência deve ser **avaliada quando mensurável**, mas a ausência de medição física deve constar expressamente no relatório — não se torna um número inventado nem aprovação do RNF-01. Se o critério de aceite de latência for imposto como bloqueante pelo avaliador, classificar o resultado como PENDENTE, não como aprovado.

## 14. Algoritmo Q-11 — roteiro de operação e contingência

\`\`\`pseudocode
PROCEDIMENTO apresentarRealityBender():
    1. CONFIRMAR HTTPS/WSS, Wi-Fi e computador no data-show
    2. ABRIR /stage, criar sessão e mostrar QR real
    3. ESCANEAR com celular e confirmar pareamento
    4. CLICAR Iniciar câmera e permitir somente câmera
    5. AGUARDAR primeiro quadro real no PC
    6. REALIZAR calibração #5, conferir braços/mãos e luz
    7. ATIVAR tela cheia sem perder video
    8. MODO NONE por 5s; mover objeto para evidenciar live
    9. MODO ENERGY: aproximar/afastar e deslocar duas mãos
    10. MODO PORTAL: mover palma aberta e girar mão
    11. MODO AURA: abrir braços e movimentar um braço isolado
    12. ALTERNAR rapidamente modos sem encerrar câmera
    13. ENCERRAR sessão e confirmar câmera desligada
FIM_PROCEDIMENTO

SE rastreamento oscila:
    melhorar iluminação/enquadramento; recalibrar; usar COMPAT se necessário
SE vídeo interrompe:
    mostrar diagnóstico, clicar Reconectar, preservar autorização válida
SE ICE falha por isolamento de rede:
    mudar para Wi-Fi sem isolamento; não prometer sucesso sem teste
SE WebGL falha:
    manter vídeo, alternar navegador/PC com WebGL2, não inventar efeitos
SE problema irrecuperável:
    declarar falha e usar demonstração de vídeo ao vivo simples, sem fingir VFX
FIM_CONTINGENCIA
\`\`\`

## 15. CI, regressão, segurança e critérios de bloqueio

\`\`\`pseudocode
WORKFLOW CI:
    checkout
    setup Node version compatível com package.json
    npm ci
    npm run lint
    npm run typecheck
    npm run test
    npm run build
    npm run smoke:server   // criar script real ou usar script existente
    qualquer erro -> workflow vermelho
FIM_WORKFLOW

FUNÇÃO revisarRegressao():
    COMPARAR branches e garantir que:
        #2 segue isolando sessões e tokens
        #3 continua transportando vídeo WebRTC real
        #4 preserva mapeamento retrato/paisagem/mirror
        #5 não possui fila de inferência acumulada
        #6–#8 continuam reagindo a landmarks reais
        #9 reporta falha sem congelar vídeo "ao vivo"
    FIM
    INSPECIONAR warnings de navegador, vazamentos de event listener,
        permissões, CSP, origens e dependências
    NÃO alterar assert ou remover teste para criar CI verde
FIM_FUNÇÃO
\`\`\`

## 16. Pseudocódigo de smoke e testes de relatório

\`\`\`pseudocode
SUITE ResultadoDeTeste:
    matriz inicialmente contém 18 status NOT_RUN
    PASS sem observedResult ou executedAt -> erro de validação
    BLOCKED sem motivo -> erro de validação
    PASS físico sem evidência de hardware -> erro de validação
    id fora CT-01..CT-18 ou duplicado -> erro
    resultado físico indisponível -> NOT_RUN/BLOCKED, não PASS
FIM_SUITE

SUITE EstatisticaFPS:
    120 janelas, 114 com FPS>=30 -> compliance=0.95 -> PASS
    120 janelas, 113 com FPS>=30 -> FAIL
    medição 80s quando exigido 120s -> INSUFFICIENT_DURATION
    timestamps NaN ou negativos -> erro
FIM_SUITE

SUITE EstatisticaLatencia:
    criar 20 diferenças de frames conhecidas a 120fps
    median e p95 nearest-rank correspondem à lista ordenada
    menos de 20 movimentos -> INSUFFICIENT_SAMPLES
    câmeras/relógios diferentes não sincronizados -> NOT_VALID
FIM_SUITE

SUITE BrowserSmoke:
    abrir /stage via URL real de frontend compilado
    abrir /control com token de teste autorizado em harness seguro
    simular negação de permissão com browser automation (apenas UI)
    verificar mensagens e comandos sem vídeo fictício
    marcar flows físicos separados do smoke automatizado
FIM_SUITE
\`\`\`

## 17. Critérios finais e negative prompt

**Entrega obrigatória:** matriz completa CT-01–18 com \`PASS/FAIL/NOT_RUN/BLOCKED\`, logs reais de \`npm ci\`, lint, typecheck, tests, build e smoke; manual HTTPS/WSS reproduzível; inventário de hardware; avaliação FPS por modo; avaliação de latência física quando possível (ou não mensurada declarada); privacidade/encerramento; roteiro de apresentação e relatório com bloqueadores. Atualizar README somente com comandos executados e registrar arquivos/relações no grafo JSON.

**Não entregar:** relatório com “todos aprovados” por omissão, vídeo pré-gravado como evidência, imagens de mockup como prova de câmera, medição de latência por \`Date.now\` entre dispositivos, estatísticas inventadas, sugestão de desativar TLS/certificado, ocultação de testes falhos, ignorar bugs de pareamento, quebrar CI para aparentar sucesso, baixar requisitos sem decisão do usuário.

**Produto concluído somente após código final + testes + homologação física.** Este documento é especificação de como verificar e concluir; sua publicação não prova que a aplicação já funciona.
