# Reality Bender — Issue #1: especificação de implementação em pseudocódigo

**Versão:** 1.0  
**Origem:** https://github.com/PedroIgorBarbosa/Reality-Bender/issues/1  
**Contrato superior:** ../REALITY_BENDER_ERS_v1.0.md  
**Estado:** especificação de engenharia; código ainda não implementado.

## 1. Objetivo e fronteiras

Implementar a fundação **executável, testável e reproduzível** do Reality Bender usando uma raiz npm, Vite + React + TypeScript, Node.js + Express + Socket.IO, contratos compartilhados, validação de ambiente, rotas /stage e /control, testes e scripts de build/execução.

**O que esta issue NÃO implementa:** criação de sessão, convite QR Code, pareamento, captura de câmera, vídeo WebRTC, MediaPipe, shaders, efeitos 3D, calibração e comandos de troca de efeito. Essas funções pertencem às issues #2–#9. Nenhuma tela deve fingir que já existem.

### Invariantes globais

- INV-01: dev e produção oferecem as mesmas rotas /stage, /control, /api/health e /socket.io.
- INV-02: as duas interfaces indicam estados reais de comunicação; não existem status falsos de “Ao vivo”, “Celular pareado” ou “Câmera ligada”.
- INV-03: somente o evento técnico de verificação da conexão está implementado nesta issue. Eventos de sessão e WebRTC serão acrescentados sem substituir a base.
- INV-04: dados de configuração não podem vazar para HTML, logs nem respostas HTTP.
- INV-05: scripts de build, typecheck, lint e testes falham com código de saída não zero quando há erro.
- INV-06: o fechamento de interface ou servidor libera listeners e conexões.
- INV-07: a futura captura móvel precisará de HTTPS confiável; não recomendar ignorar segurança do navegador.

## 2. Decisões arquiteturais obrigatórias

**Decisão:** uma aplicação npm (não microserviços nem workspaces) com frontend React e servidor Node isolados por diretório, além de contratos compartilhados. Vite usa proxy /api e /socket.io em desenvolvimento; o servidor Express serve os arquivos compilados em produção. O navegador usa caminhos relativos, mantendo a mesma origem aparente.

**Diretórios e responsabilidades esperados:**

~~~text
Reality-Bender/
  README.md                         # instruções verificadas e estado real do produto
  AGENTS.md                         # contrato de agentes preexistente
  docs/REALITY_BENDER_ERS_v1.0.md   # requisito superior, não alterar semanticamente
  docs/specs/ISSUE-001-FUNDACAO-PSEUDOCODIGO.md
  package.json                      # scripts e dependências npm
  package-lock.json                 # versões reproduzíveis
  .env.example                      # variáveis sem segredos
  .gitignore
  .editorconfig
  index.html                        # mount do cliente Vite
  vite.config.ts                    # React + proxy /api e /socket.io
  vitest.config.ts                  # testes unitários, UI e integração
  tsconfig.json                     # tipos estritos
  tsconfig.server.json              # se necessário para separar tipos Node
  eslint.config.js                  # validação de qualidade
  src/
    shared/
      contracts/system-events.ts    # protocolo técnico tipado v1
      types/connection-state.ts     # união discriminada dos estados
    server/
      index.ts                      # bootstrap e graceful shutdown
      app.ts                        # rotas e fallback SPA
      config/env.ts                 # parser e validação de ambiente
      realtime/system-socket.ts     # handshake e verificação técnica Socket.IO
      routes/health.ts              # GET /api/health
    client/
      main.tsx                      # montar React
      App.tsx                       # roteamento e erro 404
      routes/StagePage.tsx          # fundação da tela de projeção
      routes/ControlPage.tsx        # fundação da tela móvel
      components/ConnectionStatus.tsx
      components/AppErrorBoundary.tsx
      realtime/create-system-client.ts
      hooks/use-system-connection.ts
      styles/global.css
  tests/
    unit/env.test.ts
    unit/connection-state.test.ts
    integration/health.test.ts
    integration/socket.test.ts
    ui/routes.test.tsx
  .github/workflows/ci.yml
~~~

Os nomes são parte do contrato de organização, mas o implementador pode corrigir a extensão/configuração necessária para uma dependência real desde que preserve separação e registre a decisão. Não criar diretórios vazios ou arquivos de fachada.

## 3. Tipos e contratos base

~~~pseudocode
ENUM ConnectionPhase:
    IDLE
    CONNECTING
    ONLINE
    RECONNECTING
    OFFLINE
    ERROR
FIM_ENUM

TIPO ConnectionState = UNIAO_DISCRIMINADA:
    { phase: IDLE }
    { phase: CONNECTING }
    { phase: ONLINE, protocolVersion: 1, connectedAt: ISO_DATETIME }
    { phase: RECONNECTING, attempt: INTEIRO_NAO_NEGATIVO }
    { phase: OFFLINE, reason: TEXTO_SEGURO }
    { phase: ERROR, code: CODIGO_CONHECIDO, message: TEXTO_SEGURO }
FIM_TIPO

CONSTANTE SIGNAL_PROTOCOL_VERSION = 1

TIPO SystemReadyPayload:
    protocolVersion: 1
    service: "reality-bender-signaling"
FIM_TIPO

TIPO SystemPingPayload:
    requestId: STRING_NAO_VAZIA_COM_LIMITE_64
FIM_TIPO

TIPO SystemPingAck:
    ok: BOOLEANO
    requestId: STRING_NAO_VAZIA_COM_LIMITE_64
    protocolVersion: 1
FIM_TIPO

EVENTOS_CLIENTE_PARA_SERVIDOR:
    "system:ping"(SystemPingPayload, callback(SystemPingAck))
FIM_EVENTOS

EVENTOS_SERVIDOR_PARA_CLIENTE:
    "system:ready"(SystemReadyPayload)
FIM_EVENTOS

INVARIANTE_EVENTOS:
    Nenhum evento "session:*", "rtc:*" ou "stage:set-mode" é operacional nesta issue.
    Não responder "ok" a eventos desconhecidos.
    Não armazenar identificadores de câmera, vídeo ou dados corporais.
FIM
~~~

A conexão Socket.IO representa somente a disponibilidade do servidor de sinalização, não uma sessão pareada. Não reutilizar seu status como status da câmera.

## 4. Algoritmo A-01 — preparar dependências, versões e scripts

~~~pseudocode
PROCEDIMENTO INICIALIZAR_REPOSITORIO()
    PRECONDICAO:
        README.md, AGENTS.md, ERS, .gitignore e .editorconfig já existem.
    VERIFICAR versão do Node.js >= 22.12
    CRIAR package.json com:
        "private" = true
        "type" = "module"
        "engines.node" = ">=22.12"
        scripts:
            dev          -> executar frontend Vite e servidor em paralelo
            dev:web      -> vite --host 127.0.0.1
            dev:server   -> tsx watch src/server/index.ts
            build        -> build do cliente seguido de build do servidor
            build:web    -> vite build, saída dist/client
            build:server -> tsup src/server/index.ts, saída dist/server/index.js
            start        -> node dist/server/index.js
            typecheck    -> tsc --noEmit (abrangendo código cliente/servidor/contratos/testes)
            lint         -> eslint . com falha em erro
            test         -> vitest run
            test:watch   -> vitest
    INSTALAR dependências de produção:
        react, react-dom, react-router-dom, express, socket.io, socket.io-client
    INSTALAR dependências de engenharia:
        typescript, vite, plugin React de Vite, tsx, tsup,
        vitest, jsdom, React Testing Library, ESLint,
        types React/Node/Express, utilitário para scripts paralelos
    GERAR package-lock.json pela instalação npm
    CRIAR configurações com TypeScript strict:
        strict = true
        noUncheckedIndexedAccess = true
        noImplicitAny = true
        usar alias compartilhado apenas se funcionar em Vite, tsup, Vitest e typecheck
    CONFIGURAR JSX React e resolução de módulo compatíveis com Vite/tsup
    VERIFICAR que importações de tipos não geram dependência circular
    EXECUTAR npm ci a partir de lockfile gerado
    SE npm ci falhar:
        CORRIGIR dependências e gerar lockfile consistente
        NÃO editar lockfile à mão
    FIM_SE
POSCONDICAO:
    Ambiente reproduzível e comandos documentados.
FIM_PROCEDIMENTO
~~~

**Observação de implementação:** as versões exatas das bibliotecas devem ser escolhidas por compatibilidade efetiva e registradas no lockfile. Não copiar versões arbitrárias sem instalação e teste. O servidor pode usar tsup para evitar divergência entre compilação ESM e execução Node; o typecheck continua obrigatório.

## 5. Algoritmo A-02 — carregar e validar configuração

~~~text
.env.example
  NODE_ENV=development
  HOST=127.0.0.1
  PORT=3000
  CLIENT_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
  PUBLIC_BASE_URL=
~~~

"CLIENT_ORIGINS" contém origens explícitas da interface; deve incluir o domínio HTTPS temporário somente quando efetivamente configurado. "PUBLIC_BASE_URL" é opcional nesta issue e será usado para convites da issue #2.

~~~pseudocode
FUNCAO CARREGAR_CONFIGURACAO(envBruto) RETORNA ServerConfig:
    CARREGAR variáveis locais .env, sem sobrescrever variáveis de processo já definidas

    nodeEnv <- envBruto.NODE_ENV OU "development"
    SE nodeEnv NÃO ESTIVER_EM {"development", "test", "production"}:
        LANÇAR ConfigurationError("NODE_ENV inválido")
    FIM_SE

    host <- envBruto.HOST OU "127.0.0.1"
    SE host NÃO FOR hostname/IP não vazio e válido para bind:
        LANÇAR ConfigurationError("HOST inválido")
    FIM_SE

    portTexto <- envBruto.PORT OU "3000"
    SE portTexto não representar inteiro decimal:
        LANÇAR ConfigurationError("PORT deve ser inteiro")
    FIM_SE
    port <- CONVERTER_PARA_INTEIRO(portTexto)
    SE port < 1 OU port > 65535:
        LANÇAR ConfigurationError("PORT fora do intervalo permitido")
    FIM_SE

    originsTexto <- envBruto.CLIENT_ORIGINS OU ""
    origins <- SPLIT(originsTexto, ",") |> TRIM |> REMOVER_VAZIOS |> DISTINCT
    SE origins estiver vazio:
        LANÇAR ConfigurationError("CLIENT_ORIGINS deve listar origens autorizadas")
    FIM_SE

    PARA cada origem EM origins:
        url <- PARSE_URL(origem)
        VALIDAR origem exatamente no formato "scheme://host[:port]"
        RECUSAR credenciais, caminho, querystring e fragmento
        SE nodeEnv = "production" E esquema != "https":
            LANÇAR ConfigurationError("produção requer origem HTTPS")
        FIM_SE
        SE esquema = "http" E hostname NÃO FOR loopback local E nodeEnv != "test":
            LANÇAR ConfigurationError("origem HTTP externa não autorizada")
        FIM_SE
    FIM_PARA

    publicUrl <- VAZIO
    SE envBruto.PUBLIC_BASE_URL NÃO ESTIVER_VAZIO:
        publicUrl <- PARSE_URL(envBruto.PUBLIC_BASE_URL)
        SE publicUrl NÃO FOR URL absoluta:
            LANÇAR ConfigurationError("PUBLIC_BASE_URL inválido")
        FIM_SE
        SE esquema != "https" E hostname NÃO FOR loopback local:
            LANÇAR ConfigurationError("PUBLIC_BASE_URL externo requer HTTPS")
        FIM_SE
        REMOVER barra final redundante para formar links futuros
    FIM_SE

    RETORNAR CONFIG_IMUTAVEL {
        nodeEnv, host, port, allowedOrigins: origins, publicBaseUrl: publicUrl
    }
EM_FALHA:
    IMPRIMIR só código e nome público da variável inválida
    NUNCA imprimir .env inteiro nem segredos
    ENCERRAR processo com código diferente de zero
FIM_FUNCAO
~~~

## 6. Algoritmo A-03 — criar servidor HTTP e rotas

~~~pseudocode
FUNCAO CRIAR_APLICACAO_HTTP(config) RETORNA {expressApp, httpServer}:
    app <- NOVO Express()
    APLICAR cabeçalhos básicos de segurança compatíveis com Vite e Socket.IO
    DESABILITAR informação desnecessária de assinatura do framework
    IMPLEMENTAR GET "/api/health":
        RETORNAR HTTP 200 JSON {
            status: "ok",
            service: "reality-bender-signaling",
            protocolVersion: 1
        }
        DEFINIR Cache-Control = "no-store"
        NÃO incluir variáveis de ambiente, endpoints internos ou tokens
    FIM_ENDPOINT

    IMPLEMENTAR resposta JSON 404 para outros caminhos "/api/*"
    SE config.nodeEnv = "production":
        VERIFICAR existência de "dist/client/index.html"
        SE inexistente:
            FALHAR bootstrap com motivo "frontend não compilado"
        FIM_SE
        SERVIR arquivos estáticos de dist/client com tipos MIME corretos

        PARA cada requisição GET de navegação em HTML:
            SE caminho NÃO começar por /api e /socket.io e
               NÃO representar asset com extensão e
               Accept incluir "text/html":
                RETORNAR dist/client/index.html para React Router
            FIM_SE
        FIM_PARA
    FIM_SE

    PARA requisição não tratada:
        RETORNAR 404 sem expor stack trace
    FIM_PARA

    CONFIGURAR middleware de erro:
        REGISTRAR causa técnica sanitizada no servidor
        RESPONDER HTTP 500 JSON {error: "INTERNAL_ERROR", message: "Erro interno"}
        NÃO enviar stack trace nem configurações ao cliente
    FIM

    httpServer <- CRIAR_SERVIDOR_HTTP(app)
    RETORNAR {app, httpServer}
FIM_FUNCAO
~~~

## 7. Algoritmo A-04 — servidor Socket.IO

~~~pseudocode
FUNCAO CONFIGURAR_SINALIZACAO(httpServer, config) RETORNA io:
    io <- NOVO SocketIOServer(
        server = httpServer,
        path = "/socket.io",
        cors.allowedOrigins = config.allowedOrigins,
        cors.credentials = false
    )
    CONFIGURAR verificação da origem real na negociação, sem wildcard
    CONFIGURAR limite conservador de tamanho de mensagens
    NÃO criar salas de usuários nem sessões nesta issue

    QUANDO novo socket conectar:
        REGISTRAR evento técnico "connected" sem URL de convite/token
        socket.emit("system:ready", {
            protocolVersion: 1,
            service: "reality-bender-signaling"
        })

        REGISTRAR handler tipado "system:ping"(payload, ack):
            SE ack não for função:
                RETORNAR sem lançar exceção
            FIM_SE
            SE payload ausente OU requestId não for string:
                RETORNAR ack({ok: false, requestId: "", protocolVersion: 1})
            FIM_SE
            SE comprimento(requestId) = 0 OU comprimento > 64:
                RETORNAR ack({ok: false, requestId: "", protocolVersion: 1})
            FIM_SE
            RETORNAR ack({
                ok: true,
                requestId: payload.requestId,
                protocolVersion: 1
            })
        FIM_HANDLER

        QUANDO "disconnect":
            REGISTRAR somente razão técnica sanitizada
            LIBERAR handlers e qualquer recurso específico do socket
        FIM
    FIM_QUANDO

    RETORNAR io
FIM_FUNCAO

PROCEDIMENTO INICIAR_SERVIDOR():
    config <- CARREGAR_CONFIGURACAO(process.env)
    {app, httpServer} <- CRIAR_APLICACAO_HTTP(config)
    io <- CONFIGURAR_SINALIZACAO(httpServer, config)

    TENTAR:
        AGUARDAR httpServer.listen(config.port, config.host)
        REGISTRAR endereço local e ambiente, sem dados sensíveis
    CAPTURAR EADDRINUSE:
        REGISTRAR "porta ocupada"
        ENCERRAR com código 1
    CAPTURAR outro erro:
        REGISTRAR código seguro
        ENCERRAR com código 1
    FIM_TENTATIVA

    REGISTRAR SIGINT e SIGTERM:
        SE encerramento já começou: RETORNAR
        MARCAR encerramentoEmAndamento = true
        FECHAR io e desconectar sockets de maneira controlada
        FECHAR httpServer, com prazo máximo definido
        LIBERAR listeners do processo
        ENCERRAR com código adequado
    FIM

FIM_PROCEDIMENTO
~~~

**Regra de isolamento:** o servidor desta issue não aceita ainda "session:create", "session:join", "rtc:offer", "rtc:answer" ou comandos de efeito. Eles serão acrescentados ao contrato compartilhado na issue correspondente.

## 8. Algoritmo A-05 — configurar Vite e paridade dev/produção

~~~pseudocode
PROCEDIMENTO CONFIGURAR_VITE():
    ATIVAR plugin React
    DEFINIR raiz do frontend apontando para index.html
    DEFINIR output em "dist/client"
    DEFINIR porta de desenvolvimento 5173
    DEFINIR proxy de desenvolvimento:
        "/api" -> "http://127.0.0.1:3000"
        "/socket.io" -> "http://127.0.0.1:3000"
        websocketUpgrade("/socket.io") = true
    NÃO inventar host público do celular automaticamente
    DOCUMENTAR que o frontend pode ser exposto por HTTPS confiável,
        com origem permitida em CLIENT_ORIGINS e proxy websocket funcional
    GARANTIR refresh direto de "/stage" e "/control" em desenvolvimento
    GARANTIR refresh direto dessas rotas com Express em produção
FIM_PROCEDIMENTO
~~~

## 9. Algoritmo A-06 — criar cliente Socket.IO e hook de estados

~~~pseudocode
FUNCAO CRIAR_CLIENTE_SISTEMA() RETORNA SignalingClient:
    socket <- SocketIOClient(
        origin = ORIGEM_DA_PAGINA_ATUAL,
        path = "/socket.io",
        autoConnect = false,
        reconnection = true
    )
    RETORNAR wrapper tipado do socket
FIM_FUNCAO

HOOK USAR_ESTADO_DA_SINALIZACAO():
    estado <- {phase: IDLE}
    referenciaDoSocket <- NULO

    AO_MONTAR:
        SE componente já estiver desmontando:
            RETORNAR
        FIM_SE
        estado <- {phase: CONNECTING}
        socket <- CRIAR_CLIENTE_SISTEMA()
        referenciaDoSocket <- socket
        registrarHandlersANTES_de_connect()

        QUANDO socket.emitir("connect"):
            NÃO definir ONLINE ainda
            AGUARDAR evento "system:ready" com timeout limitado
        FIM

        QUANDO receber "system:ready"(payload):
            SE protocolVersion != 1:
                estado <- {phase: ERROR, code: "PROTOCOL_MISMATCH", ...}
                DESCONECTAR socket
                RETORNAR
            FIM_SE
            ENVIAR "system:ping" com requestId aleatório curto e ack
            AGUARDAR ack por timeout limitado
            SE ack.ok E ack.requestId igual ao enviado:
                estado <- {phase: ONLINE, protocolVersion: 1, connectedAt: agora()}
            SENAO:
                estado <- {phase: ERROR, code: "HANDSHAKE_FAILED", ...}
            FIM_SE
        FIM

        QUANDO socket.emitir("disconnect")(reason):
            estado <- {phase: OFFLINE, reason: MENSAGEM_SEGURA(reason)}
        FIM

        QUANDO socket emitir "reconnect_attempt"(attempt):
            estado <- {phase: RECONNECTING, attempt}
        FIM

        QUANDO socket emitir "connect_error"(error):
            estado <- {phase: ERROR, code: "SERVER_UNAVAILABLE", ...}
        FIM

        socket.connect()
    FIM_AO_MONTAR

    AO_DESMONTAR:
        INVALIDAR callbacks pendentes e operações assíncronas
        CANCELAR timeouts
        REMOVER todos os handlers registrados pelo wrapper
        socket.disconnect()
        referenciaDoSocket <- NULO
        NÃO atualizar state de componente desmontado
    FIM_AO_DESMONTAR

    RETORNAR estado e função reconectar() que atua no socket real
FIM_HOOK
~~~

**Prevenção de corrida:** registrar listeners antes de "connect()", não criar duas conexões por re-render e impedir que respostas tardias alterem estado após desmontagem. Considerar montagem dupla do React Strict Mode.

## 10. Algoritmo A-07 — aplicação React e rotas

~~~pseudocode
PROCEDIMENTO MONTAR_APLICACAO_REACT():
    LOCALIZAR elemento HTML "#root"
    SE não existir:
        LANÇAR erro de inicialização identificado
    FIM_SE
    CRIAR ReactRoot
    APLICAR AppErrorBoundary
    APLICAR BrowserRouter
    REGISTRAR rota "/stage" -> StagePage
    REGISTRAR rota "/control" -> ControlPage
    REGISTRAR rota "*" -> NotFoundPage com link para "/stage"
    APLICAR tema base:
        fundo escuro não decorativo, alto contraste, tipografia legível
        área segura para mobile, botões 44px ou mais
        interface adaptável sem overflow horizontal
    NÃO inicializar câmera nem solicitar permissão ao montar
FIM_PROCEDIMENTO
~~~

### A-07.1 — tela /stage

~~~pseudocode
COMPONENTE StagePage():
    connection <- USAR_ESTADO_DA_SINALIZACAO()
    RENDERIZAR:
        título "REALITY BENDER"
        subtítulo "Tela de apresentação"
        ConnectionStatus(connection)
        seção de preparação:
            "Servidor de sinalização" = status real do handshake
            "Sessão de apresentação" = "Ainda não implementada"
            "Celular pareado" = "Não disponível nesta etapa"
            "Vídeo ao vivo" = "Não disponível nesta etapa"
        área central de projeção vazia, com texto de estado explícito,
            sem GIF, canvas falso ou fundo fingindo vídeo
        painel de controles futuros:
            criar sessão / QR: INDISPONÍVEIS, texto "Issue #2"
            vídeo / tela cheia de transmissão: INDISPONÍVEIS, texto "Issues #3-#4"
            modos dos efeitos: INDISPONÍVEIS, texto "Issues #6-#8"
        botão técnico "Reconectar servidor" com ação real de reconexão,
            disponível quando offline/erro
    SE connection.phase = ONLINE:
        MOSTRAR "Servidor conectado; sessão ainda não implementada"
    SENAO_SE CONNECTING/RECONNECTING:
        MOSTRAR feedback acessível "Conectando ao servidor..."
    SENAO:
        MOSTRAR instrução "Verifique se npm run dev está ativo"
    FIM_SE
    NÃO exibir QR Code fictício nem convite manual inválido
FIM_COMPONENTE
~~~

### A-07.2 — tela /control

~~~pseudocode
COMPONENTE ControlPage():
    connection <- USAR_ESTADO_DA_SINALIZACAO()
    invitePresent <- CONSULTAR somente presença de token no URL,
                     sem declarar o convite válido nem imprimir seu valor
    RENDERIZAR:
        título "REALITY BENDER — Controle móvel"
        ConnectionStatus(connection)
        instruções breves de enquadramento e futura permissão de câmera
        texto:
            SE invitePresent:
                "Convite recebido na URL; validação virá na Issue #2"
            SENAO:
                "Abra esta página pelo QR Code quando o pareamento estiver disponível"
            FIM
        prévia NÃO exibir como se câmera já estivesse ligada
        status da câmera = "Ainda não implementada"
        botões iniciar câmera, parar transmissão, trocar efeito:
            DESABILITADOS com razão visível, não handlers vazios
        botão técnico "Reconectar servidor" com ação funcional
    NÃO invocar navigator.mediaDevices.getUserMedia nesta issue
    NÃO criar RTCPeerConnection nem enviar frames
FIM_COMPONENTE
~~~

### A-07.3 — componente de status

~~~pseudocode
COMPONENTE ConnectionStatus(connection):
    SE ONLINE: exibir "Servidor conectado" (sem dizer "Ao vivo")
    SE CONNECTING: exibir "Conectando ao servidor"
    SE RECONNECTING: exibir "Tentando reconectar ao servidor"
    SE OFFLINE: exibir "Servidor desconectado"
    SE ERROR: exibir mensagem específica, não stack trace
    USAR aria-live="polite" para transições informativas
    USAR aria-live="assertive" somente para erros críticos
FIM_COMPONENTE
~~~

## 11. Algoritmo A-08 — tratamento de falhas e concorrência

~~~pseudocode
REGRA ERRO_ENV:
    abortar boot antes de abrir porta; mensagem segura e código de saída 1.

REGRA PORTA_OCUPADA:
    abortar sem criar servidor alternativo oculto; indicar PORT.

REGRA BACKEND_AUSENTE:
    frontend continua renderizado; mostra erro + tentativa de reconexão.

REGRA PROTOCOLO_INCOMPATIVEL:
    sinalizar falha; não tratar socket TCP aberto como contrato validado.

REGRA MENSAGEM_MALFORMADA:
    ack negativo; não lançar exceção que derrube processo; log sanitizado.

REGRA ORIGEM_NAO_AUTORIZADA:
    recusar conexão na camada de handshake; não liberar API privada no futuro.

REGRA ROTA_INVALIDA:
    devolver 404 inteligível em UI; APIs desconhecidas devolvem JSON 404.

REGRA DUPLA_MONTAGEM_REACT:
    cada mount tem conexão e limpeza próprios; não acumular subscriptions.

REGRA RECONEXAO_EM_ANDAMENTO:
    reusar a conexão atual; não iniciar múltiplos sockets em paralelo.

REGRA SHUTDOWN:
    só executar uma vez; fechar listeners e socket server antes da saída.
~~~

## 12. Algoritmo A-09 — testes automatizados obrigatórios

Todos os testes devem usar assertions sobre comportamento real. É permitido criar socket de teste e servidor em porta efêmera **somente em testes**, sem confundir esse harness com funcionalidades do produto.

~~~pseudocode
SUITE UNITARIA_CONFIG:
    TESTE "porta válida":
        parse(PORT="3000") -> port = 3000
    TESTE "porta não numérica":
        parse(PORT="abc") -> ConfigurationError
    TESTE "porta fora de intervalo":
        parse(PORT="70000") -> ConfigurationError
    TESTE "origem em produção usando HTTP externo":
        parse(NODE_ENV="production", CLIENT_ORIGINS="http://site.com")
            -> ConfigurationError
    TESTE "origem HTTPS explícita":
        parse(CLIENT_ORIGINS="https://exemplo.com") -> lista correta
    TESTE "URL pública inválida":
        parse(PUBLIC_BASE_URL="foo") -> ConfigurationError
FIM_SUITE

SUITE UNITARIA_ESTADOS:
    TESTE estado inicial IDLE
    TESTE CONNECTING não implica ONLINE
    TESTE ONLINE requer handshake protocolVersion=1
    TESTE DISCONNECT transfere para OFFLINE
    TESTE RECONNECT_ATTEMPT transfere para RECONNECTING
    TESTE PROTOCOL_MISMATCH transfere para ERROR
    TESTE resultado tardio após cleanup é ignorado
FIM_SUITE

SUITE INTEGRACAO_HTTP:
    INICIAR servidor real em porta livre/efêmera de teste
    TESTAR GET /api/health:
        código = 200
        JSON.status = "ok"
        JSON.protocolVersion = 1
        Cache-Control = "no-store"
        resposta NÃO contém variáveis de ambiente
    TESTAR GET /api/rota-inexistente => 404 JSON
    FINALMENTE fechar servidor (não deixar portas abertas)
FIM_SUITE

SUITE INTEGRACAO_SOCKET:
    INICIAR servidor Socket.IO real de teste
    CONECTAR socket.io-client de teste
    ESPERAR evento "system:ready":
        protocolVersion = 1
    ENVIAR "system:ping" com requestId "test-123":
        ACK.ok = true
        ACK.requestId = "test-123"
        ACK.protocolVersion = 1
    ENVIAR ping com requestId de 65+ caracteres:
        ACK.ok = false
    TESTAR origem de navegador não autorizada:
        handshake rejeitado quando Origin fora da allowlist
    DESCONECTAR cliente e fechar servidor
FIM_SUITE

SUITE INTERFACE:
    RENDERIZAR /stage sem servidor:
        página exibe status desconectado
        botão reconectar visível e funcional
        não contém "Ao vivo" como status ativo
        QR de pareamento não é falsificado
    RENDERIZAR /control sem convite:
        mostra instrução informativa
        iniciar câmera desabilitado
        getUserMedia não é chamado
    RENDERIZAR /control com token simulado na URL:
        não informa "convite válido" sem validação
        token bruto não aparece na interface
    RENDERIZAR rota inexistente:
        mostra página 404 e caminho para /stage
    TESTAR limpeza após desmontar componentes:
        listeners removidos e socket desconectado
FIM_SUITE

SUITE BUILD:
    EXECUTAR npm ci em instalação limpa
    EXECUTAR npm run lint -> exit 0
    EXECUTAR npm run typecheck -> exit 0
    EXECUTAR npm run test -> exit 0
    EXECUTAR npm run build -> exit 0
    INICIAR npm run start:
        GET /api/health -> 200
        GET /stage -> HTML da aplicação
        GET /control -> HTML da aplicação
    PARAR processo
FIM_SUITE
~~~

Requisitos de qualidade dos testes:

- Sem "expect(true).toBe(true)" ou mocks que apenas reproduzem a implementação.
- Integração com Socket.IO deve abrir conexão real dentro do teste, não apenas invocar funções mockadas.
- Testes de UI podem mockar transporte, mas precisam verificar estados e comportamento dos botões.
- Os testes não devem exigir câmera, GPU ou internet. A validação física começa nas issues posteriores.

## 13. Algoritmo A-10 — CI e execução reproduzível

~~~pseudocode
WORKFLOW GitHubActions_CI:
    DISPARAR em push e pull_request
    USAR ubuntu-latest
    USAR Node.js 22.x
    EXECUTAR checkout
    EXECUTAR setup-node com cache npm
    EXECUTAR npm ci
    EXECUTAR npm run lint
    EXECUTAR npm run typecheck
    EXECUTAR npm run test
    EXECUTAR npm run build
    MARCAR falha se qualquer etapa falhar
FIM_WORKFLOW

DOCUMENTAR README:
    PREREQUISITOS: Node >=22.12 e npm compatível
    INSTALAR: npm ci
    CONFIGURAR: copiar .env.example para .env e preencher origens
    DEV: npm run dev
    ABRIR no PC: http://localhost:5173/stage
    ABRIR em teste desktop: http://localhost:5173/control
    PROD_LOCAL: npm run build && npm run start
    TESTAR: npm run lint && npm run typecheck && npm run test
    HTTPS: para uso futuro da câmera móvel usar origem HTTPS confiável,
           configurar túnel/reverse proxy + CLIENT_ORIGINS,
           não usar http://IP_LAN como origem segura presumida
    STATUS: documentar que sessão, QR, câmera, RTC e efeitos não existem ainda
    PROBLEMAS: porta ocupada, backend offline, origem bloqueada
FIM_DOCUMENTACAO
~~~

## 14. Matriz de rastreabilidade

| Requisito de origem | Entrega efetiva nesta issue | Evidência |
| --- | --- | --- |
| RF-01 | Preparação de rota /stage e contratos base; criação real de sessão pertence à #2 | /stage abre; não apresenta QR falso |
| RF-23 | Estrutura responsiva e estados honestos da tela /stage | testes de UI e navegador |
| RF-24 | Estrutura responsiva e estados honestos da tela /control | testes de UI e navegador |
| RNF-11 | Compatibilidade-alvo com Chrome/Edge e TypeScript/React suportados | verificação de rotas, build |
| RNF-16 | Testes determinísticos e integração do transporte técnico | Vitest executado |
| RNF-18 | Dependências locais, nenhuma API paga e lockfile | npm ci, inspeção das dependências |
| RNF-19 | Instruções de instalação, start, produção e HTTPS | README validado |

**Nota de escopo:** o RF-01 só estará integralmente implementado pela issue #2; nesta issue prepara-se sua estrutura sem declarar o requisito concluído.

## 15. Critérios de aceite final (todos obrigatórios)

- [ ] O repositório contém a árvore de arquivos funcional sem arquivos de fachada.
- [ ] "npm ci" conclui em ambiente limpo.
- [ ] "npm run dev" serve /stage e /control.
- [ ] "npm run build" compila cliente e servidor, e "npm run start" funciona com o resultado compilado.
- [ ] "npm run lint", "npm run typecheck" e "npm run test" passam de verdade.
- [ ] GET /api/health responde com contrato definido, sem expor segredos.
- [ ] Socket.IO conecta, realiza ready + ping/ack e identifica desconexão.
- [ ] Os estados de rede são mostrados corretamente em ambas as rotas.
- [ ] Um backend indisponível não causa tela em branco; há orientação de reconexão.
- [ ] Rotas desconhecidas e erros de inicialização têm resposta específica.
- [ ] .env.example é válido e sem credenciais; origens CORS não usam wildcard.
- [ ] Não existem sessão, convite, vídeo ou efeito falsificados.
- [ ] CI, documentação e comandos de instalação foram realmente testados.
- [ ] O PR inclui resultado de testes, limitações e referência a "Closes #1" quando estiver pronto.

## 16. Negative prompt — proibido entregar

Não adicionar banco de dados, autenticação, contas, microserviços, dashboard, processamento de vídeo, WebRTC, MediaPipe, Three.js, efeitos, upload de quadros, streaming por WebSocket, GIF de apresentação, QR falso, sessão falsa, botões visualmente ativos sem comportamento, endpoint que aceite convite sem validar, placeholder alegando implementação, métricas FPS/latência inventadas, segredo no repositório, hack para ignorar HTTPS ou certificação manual insegura.

**Resultado concreto da issue #1:** fundação executável que prova interface React ⇄ servidor Node/Socket.IO, pronta para receber sessão e QR Code na issue #2.
