# REALITY BENDER — Issue #2: sessões, QR Code e sinalização segura

**Versão:** 1.0 · **Issue:** https://github.com/PedroIgorBarbosa/Reality-Bender/issues/2  
**Contrato superior:** \`docs/REALITY_BENDER_ERS_v1.0.md\` · **Dependência:** #1  
**RF:** RF-01, RF-02, RF-03, RF-06, RF-09 · **RNF:** RNF-08, RNF-09, RNF-10.

## 1. Resultado esperado e fronteira

Ao entrar em \`/stage\`, o operador cria uma sessão isolada, recebe um convite criptográfico temporário, exibe QR Code válido e permite que **um** celular entre em \`/control\`. O servidor conhece papel, posse e expiração de cada sessão; só transmite eventos de sinalização a um par autorizado. O vídeo ainda não é transmitido nesta issue (#3).

**Invariantes:** (I1) \`sessionId\` não é credencial; (I2) nenhum evento enviado por socket pode indicar ou alterar arbitrariamente outra sessão; (I3) convite não pode ser previsível, reutilizado nem aparecer em logs; (I4) segundo celular não desconecta o primeiro; (I5) fechar sessão revoga credenciais; (I6) QR é exibido somente com URL móvel HTTPS confiável; (I7) \`rtc:*\` nesta issue é **roteado e validado**, não afirma transmitir vídeo.

## 2. Arquivos e responsabilidades

\`\`\`text
src/shared/contracts/session-events.ts   # DTOs, versões, payloads e erros
src/shared/contracts/session-states.ts   # enums, transições permitidas
src/server/session/session-store.ts      # armazenamento somente em memória
src/server/session/session-service.ts    # caso de uso atômico
src/server/session/invite-service.ts     # criptografia e URL de convite
src/server/realtime/session-handlers.ts  # autorização/eventos Socket.IO
src/server/realtime/rtc-relay.ts         # retransmissão de SDP/ICE validada
src/client/realtime/session-client.ts    # cliente tipado com ack/timeout
src/client/routes/StagePage.tsx          # QR, expiração, comandos e estado
src/client/routes/ControlPage.tsx        # convite, entrada e erros
src/client/components/InviteQRCode.tsx
tests/unit/session-store.test.ts
tests/unit/invite-service.test.ts
tests/integration/session-signaling.test.ts
tests/ui/session-routes.test.tsx
\`\`\`

Reusar configurações, Socket.IO, React e \`AGENTS.md\` da #1; não substituir módulos existentes sem necessidade. Antes de editar, consultar grafo de contexto por caminho/relação e verificar o código real.

## 3. Contrato de dados, estados e eventos

\`\`\`pseudocode
ENUM Role = STAGE | CONTROL
ENUM SessionPhase = CREATED | WAITING_FOR_PHONE | PAIRED | CONNECTING | LIVE
                    | INTERRUPTED | CLOSED
ENUM JoinError = INVITE_INVALID | INVITE_EXPIRED | INVITE_USED
                 | SESSION_CLOSED | EMITTER_OCCUPIED | UNAUTHORIZED
                 | INVALID_PAYLOAD | RESUME_INVALID | SESSION_NOT_FOUND

TIPO SessionInternal:
    sessionId: UUID_CRIPTOGRAFICO
    phase: SessionPhase
    stageSocketId: string | null
    stageResumeHash: hash
    controlSocketId: string | null
    controlResumeHash: hash | null
    inviteHash: hash
    inviteExpiresAt: epoch_ms
    inviteConsumedAt: epoch_ms | null
    createdAt: epoch_ms
    closedAt: epoch_ms | null
    negotiationEpoch: inteiro >= 0
    disconnectDeadlineAt: epoch_ms | null
    currentMode: NONE | ENERGY | PORTAL | AURA
FIM_TIPO

TIPO SessionCreated:
    sessionId, inviteUrl, inviteExpiresAt, stageResumeSecret
FIM_TIPO

TIPO SessionJoined:
    sessionId, role=CONTROL, controlResumeSecret, phase=PAIRED
FIM_TIPO

TIPO SessionPublicStatus:
    sessionId, phase, hasStage, hasControl, inviteExpiresAt,
    activeMode, errorCode?       // NUNCA incluir hashes/secrets
FIM_TIPO

TIPO RelayEnvelope:
    negotiationEpoch: inteiro
    payload: DTO_VALIDADO_POR_EVENTO
FIM_TIPO

EVENTOS CANÔNICOS (seguir ERS):
    session:create -> ACK session:created
    session:join -> ACK session:joined
    session:rotate-invite -> ACK session:created
    session:resume -> ACK session:joined / session:status
    session:leave -> ACK
    session:status -> broadcast de status aos participantes atuais
    rtc:offer -> CONTROL para STAGE
    rtc:answer -> STAGE para CONTROL
    rtc:ice-candidate -> ambos para par oposto
    stage:set-mode -> ambos autorizados, estado compartilhado
FIM_EVENTOS

CONTRATO DE NOMES:
    Usar rtc:ice-candidate e stage:set-mode conforme ERS.
    Não duplicar como rtc:ice ou control:mode sem camada explícita de compatibilidade.
    sessionId fornecido no payload NÃO concede autorização.
FIM
\`\`\`

Para #3, \`CONNECTING/LIVE/INTERRUPTED\` serão ativados **após eventos reais de mídia**. Nesta issue, estado máximo observável no front-end é \`PAIRED\`.

## 4. Algoritmo S-01 — criar sessão com propriedade exclusiva

\`\`\`pseudocode
FUNÇÃO criarSessao(stageSocket, solicitação, clock):
    VALIDAR socket conectado e origem previamente autorizada
    VALIDAR solicitação com schema estrito (sem campos extras)
    VALIDAR que socket não possui outra sessão aberta como STAGE
    sessionId <- crypto.randomUUID()
    stageResumeSecret <- BASE64URL(crypto.randomBytes(32))
    inviteToken <- BASE64URL(crypto.randomBytes(32))
    ATUAL <- clock.now()

    NOVA_SESSAO <- {
        sessionId, phase: CREATED,
        stageSocketId: stageSocket.id,
        stageResumeHash: SHA256(stageResumeSecret),
        controlSocketId: null,
        controlResumeHash: null,
        inviteHash: SHA256(inviteToken),
        inviteExpiresAt: ATUAL + 10_minutos,
        inviteConsumedAt: null,
        createdAt: ATUAL,
        closedAt: null,
        negotiationEpoch: 0,
        currentMode: NONE
    }
    GARANTIR unicidade do sessionId; em colisão gerar outro
    GUARDAR sessão em Map<sessionId,SessionInternal>
    GUARDAR índice socketId -> {sessionId,role:STAGE}
    TRANSICIONAR CREATED -> WAITING_FOR_PHONE
    inviteUrl <- CONSTRUIR_INVITE_HTTPS("/control", inviteToken)
    SE URL HTTPS não configurada:
        RETORNAR status WAITING e erro público HTTPS_REQUIRED
        NÃO fabricar URL http://IP_LOCAL
    FIM_SE
    RETORNAR SessionCreated com inviteUrl, expiração e segredo de retomada
    EMITIR session:status à STAGE autorizada
FIM_FUNÇÃO
\`\`\`

O segredo de retomada do STAGE vive apenas na memória da aba (não em querystring nem logs); reload completo cria outra sessão. Se usado \`sessionStorage\`, explicitar riscos e invalidação — não é obrigatório persistir nada.

## 5. Algoritmo S-02 — construir URL e QR de convite

\`\`\`pseudocode
FUNÇÃO construirInviteUrl(publicBaseUrl, token):
    VERIFICAR URL absoluta HTTPS, hostname real, sem userinfo nem fragmento
    VALIDAR que URL pública chega ao mesmo aplicativo que recebeu o convite
    DEFINIR caminho = "/control"
    DEFINIR query estrita: invite = token
    RETORNAR URL serializada por construtor de URL
FIM_FUNÇÃO

COMPONENTE InviteQRCode(inviteUrl, expiresAt):
    SE inviteUrl ausente ou não HTTPS:
        EXIBIR "Configure acesso HTTPS no celular"
        NÃO renderizar QR supostamente utilizável
        RETORNAR
    FIM_SE
    GERAR QR por biblioteca local a partir da STRING EXATA inviteUrl
    RENDERIZAR QR com contraste, quiet zone, texto legível de validade
    DISPONIBILIZAR "Copiar link" com cópia real do mesmo inviteUrl
    NÃO mostrar token isoladamente em analytics, DOM debug ou log
    AO expirar: SUBSTITUIR QR por "Convite expirado" e ação regenerar
FIM_COMPONENTE

FUNÇÃO regenerarConvite(stageSocket, sessionId):
    AUTORIZAR STAGE proprietário da sessão
    VALIDAR session.phase = WAITING_FOR_PHONE e ausência de CONTROL
    GERAR novo randomBytes(32), hash e expiração
    INVALIDAR hash anterior atomicamente
    ATUALIZAR memória
    RETORNAR novo inviteUrl
FIM_FUNÇÃO
\`\`\`

## 6. Algoritmo S-03 — validação e entrada atômica do celular

\`\`\`pseudocode
FUNÇÃO entrarComoControl(controlSocket, inviteToken, clock):
    VALIDAR origem do socket (handshake) e estrutura do payload
    VALIDAR inviteToken é string base64url de tamanho esperado
    hashRecebido <- SHA256(inviteToken)
    session <- LOCALIZAR_POR_HASH(hashRecebido)
    SE não encontrado: NEGAR INVITE_INVALID
    SE session.phase = CLOSED: NEGAR SESSION_CLOSED
    SE clock.now() >= session.inviteExpiresAt: NEGAR INVITE_EXPIRED
    SE session.inviteConsumedAt != null: NEGAR INVITE_USED
    SE session.controlSocketId != null: NEGAR EMITTER_OCCUPIED
    SE session.stageSocketId = null: NEGAR STAGE_UNAVAILABLE

    // Região crítica síncrona: nenhuma operação await antes da reserva.
    RESERVAR session.controlSocketId = controlSocket.id
    MARCAR inviteConsumedAt = clock.now()
    GERAR controlResumeSecret de 256 bits e guardar somente seu hash
    INDEXAR socketId -> {sessionId, role:CONTROL}
    TRANSICIONAR WAITING_FOR_PHONE -> PAIRED
    RESPONDER SessionJoined(sessionId, role, controlResumeSecret)
    NOTIFICAR STAGE da entrada com session:status
FIM_FUNÇÃO
\`\`\`

Node.js pode intercalar handlers ao atingir um \`await\`. Por isso, toda verificação/reserva deve ser indivisível do ponto de vista do event loop; se a persistência futura mudar, usar compare-and-set ou lock por sessão. Nunca remover o emissor existente por uma nova tentativa.

## 7. Algoritmo S-04 — retomada autorizada e descontinuidade de sockets

\`\`\`pseudocode
FUNÇÃO retomarParticipante(socketNovo, sessionId, role, resumeSecret):
    VALIDAR tamanho, forma e expiração de credenciais
    LOCALIZAR sessão em memória por sessionId
    NEGAR se encerrada/expirada
    hash <- SHA256(resumeSecret)
    VERIFICAR equivalência com hash armazenado do role
        usando comparação resistente a timing quando possível
    SE credencial incorreta: NEGAR RESUME_INVALID
    SE role=CONTROL E emissor antigo segue saudável e ativo:
        NEGAR EMITTER_OCCUPIED     // não permitir sequestro silencioso
    FIM_SE
    INVALIDAR índice do socket antigo
    ASSOCIAR índice do socket novo e session socketId
    INCREMENTAR negotiationEpoch
    ATUALIZAR status para PAIRED ou INTERRUPTED conforme fluxo de mídia
    EMITIR status a participantes presentes
    RETORNAR sucesso e novo resumeSecret rotacionado
FIM_FUNÇÃO

QUANDO socket desconecta:
    CONSULTAR vínculo pelo socketId
    SE nenhum: RETORNAR
    MARCAR participante desconectado
    DEFINIR graceDeadline = agora + 30 segundos
    AGENDAR limpeza com cancelamento por retorno autorizado
    EMITIR status de ausência ao par presente
    AO expirar graceDeadline:
        SE role=CONTROL e não retomado: liberar vaga e revogar controle
        SE role=STAGE e não retomado: encerrar sessão e revogar todos tokens
    FIM
FIM

INVARIANTE:
    O convite de ingresso NÃO é a credencial de retomada.
    Os segredos de retomada nunca devem ser enviados como query URL.
    Fechar sessão revoga convite, controle e retomadas.
FIM
\`\`\`

A retomada por \`session:resume\` deve ser vinculada a uma desconexão anterior ou revogação explícita. O protocolo de WebRTC reconstruído pertence à #3.

## 8. Algoritmo S-05 — autorização e encaminhamento de eventos

\`\`\`pseudocode
FUNÇÃO autorizarEvento(socket, sessionIdIgnoravel, papelPermitido):
    vínculo <- reverseSocketIndex.get(socket.id)
    SE vínculo inexistente: NEGAR UNAUTHORIZED
    session <- store.get(vínculo.sessionId)
    SE session nula ou CLOSED: NEGAR SESSION_CLOSED
    SE vínculo.role não pertence papelPermitido: NEGAR UNAUTHORIZED
    SE socket.id != session.socketIdDoPapel(vínculo.role):
        NEGAR UNAUTHORIZED     // credencial de socket antigo
    FIM_SE
    SE sessionIdIgnoravel informado E != vínculo.sessionId:
        NEGAR UNAUTHORIZED
    FIM_SE
    RETORNAR {session, role:vínculo.role}
FIM_FUNÇÃO

FUNÇÃO encaminharRct(socket, nomeEvento, envelope):
    actor <- autorizarEvento(socket, envelope.sessionId?, papeisPermitidos)
    VALIDAR nomeEvento é rtc:offer | rtc:answer | rtc:ice-candidate
    VALIDAR direção:
        offer somente CONTROL -> STAGE
        answer somente STAGE -> CONTROL
        ice-candidate só de um dos dois -> outro
    VALIDAR envelope.negotiationEpoch = session.negotiationEpoch
    VALIDAR tamanho do SDP <= 64 KiB, formato/descrição correspondente
    VALIDAR tamanho do candidato ICE <= 8 KiB e schema esperado
    VALIDAR tipo de SDP por nomeEvento; descartar campos extras
    APLICAR rate limit por evento/socket (evitar abuso do relay)
    ENCAMINHAR diretamente ao socketId do papel oposto
    SE contraparte não conectada:
        RETORNAR erro PEER_UNAVAILABLE; não guardar SDP antigo
    FIM_SE
    NÃO fazer broadcast por room sem filtrar papéis
FIM_FUNÇÃO

FUNÇÃO definirModo(socket, solicitado):
    {session} <- autorizarEvento(socket, solicitado.sessionId?, [STAGE,CONTROL])
    VALIDAR mode em {NONE,ENERGY,PORTAL,AURA}
    SE versão/seq da sessão inconsistente: rejeitar comando obsoleto
    ATUALIZAR session.currentMode na memória
    EMITIR stage:set-mode aos dois participantes autorizados
    NÃO alterar RTCPeerConnection nem reconhecer gesto nesta issue
FIM_FUNÇÃO
\`\`\`

A mensagem \`stage:set-mode\` apenas sincroniza o **estado de seleção**; os efeitos ainda não existem. A implementação da UI não pode declarar que o efeito está sendo renderizado.

## 9. Algoritmo S-06 — encerrar sessão, expirar e limpar

\`\`\`pseudocode
FUNÇÃO encerrarSessao(socket, sessionId):
    VALIDAR papel STAGE proprietário
    SE sessão já CLOSED: responder idempotente "já encerrada"
    TRANSICIONAR -> CLOSED
    INVALIDAR inviteHash, resumeHashes e todos os índices
    INCREMENTAR negotiationEpoch para invalidar tráfego atrasado
    EMITIR session:status(CLOSED) para STAGE e CONTROL ainda conectados
    REMOVER timers associados, estado de socket e dados da sessão
    RETORNAR ACK de encerramento
FIM_FUNÇÃO

PROCEDIMENTO expurgarSessoes():
    a cada 60 segundos ou por timer individual:
        INVALIDAR convites vencidos não consumidos
        LIMPAR sessões órfãs expiradas
        CANCELAR timers ao remover sessão
    NÃO registrar secrets
FIM_PROCEDIMENTO

QUANDO servidor encerrar:
    PARA todas sessões em memória:
        notificar encerramento quando canal disponível
        limpar timers e índices
    FIM
    liberar serviço de socket e HTTP pela rotina da #1
FIM
\`\`\`

## 10. Estados, concorrência e fluxos alternativos

\`\`\`text
CREATED -> WAITING_FOR_PHONE -> PAIRED -> (CONNECTING -> LIVE na #3)
             |                    |
             | convite expira     | queda de CONTROL
             v                    v
        WAITING_FOR_PHONE     PAIRED sem emissor (janela de retomada)
             |                    |
             +--------> CLOSED <--+
\`\`\`

| Condição | Estado/erro | Comportamento observável |
| --- | --- | --- |
| Token alterado | INVITE_INVALID | Não cria vínculo; permite solicitar novo QR ao STAGE |
| Token vencido | INVITE_EXPIRED | STAGE pode rotacionar convite sem recriar projeto |
| Segundo CONTROL | EMITTER_OCCUPIED | Preserva primeiro emissor e seu estado |
| Duas entradas concorrentes | Apenas primeira ganha | Reserva síncrona, resposta negativa à segunda |
| STAGE some | janela de retomada | Não autorizar controle de sessão por terceiros |
| Mensagem SDP fora de ordem | STALE_EPOCH | Descarta, não retransmite para peer novo |
| Socket sem autorização | UNAUTHORIZED | Não revela participantes nem mídia |
| URL HTTP externa | HTTPS_REQUIRED | Não fornece QR inválido para câmera |
| Reinício do servidor | Sessões perdidas intencionalmente | Cliente exibe aviso e cria nova sessão |
| Encerramento duplicado | idempotente | Sem exceção, sem sessão revivida |

## 11. Pseudocódigo dos testes obrigatórios

\`\`\`pseudocode
SUITE CriptografiaEConvites:
    GERAR 1000 convites; todos com tamanho/entropia esperados e sem duplicação
    TESTAR token adulterado -> INVITE_INVALID
    USAR fakeClock em expiresAt - 1 -> válido
    USAR fakeClock em expiresAt -> INVITE_EXPIRED
    ROTACIONAR convite -> token antigo imediatamente inválido
    VERIFICAR QR.toData = inviteUrl exatamente (não truncado)
FIM

SUITE ConcorrenciaEAutorizacao:
    STAGE cria sessão A; STAGE2 cria B
    CONTROL_A entra em A; CONTROL_B entra em B
    CONTROL_C tenta A simultâneo -> EMITTER_OCCUPIED
    CONTROL_A tenta rtc:offer com sessionId B -> UNAUTHORIZED
    STAGE_A envia rtc:answer a B -> UNAUTHORIZED
    CONTROL sem join envia stage:set-mode -> UNAUTHORIZED
    TESTAR SDP > limite e candidato ICE gigante -> rejeitados
    TESTAR negociação com epoch antiga após resume -> descartada
FIM

SUITE RetomadaEEncerramento:
    CRIAR sessão, ingressar celular, desconectar abruptamente
    RETOMAR com credencial válida após disconnect -> aceita
    RETOMAR com credencial inválida -> recusa
    FECHAR como CONTROL -> remover seu vínculo, sem fechar sessão alheia
    FECHAR como STAGE -> CLOSED e invalidar todos os tokens
    TENTAR reusar convite após fechamento -> recusado
    LIMPAR sessões vencidas -> índices/timers vazios
FIM

SUITE Interface:
    /stage mostra QR + URL somente quando HTTPS válido e sessão criada
    /stage mostra tempo restante e rota para renovar convite expirado
    /control abre por link e trata erro de token sem travar
    /control indica pareamento, NÃO indica vídeo ativo sem RTC
    botão encerrar realmente chama session:leave/close
FIM

FINAL:
    EXECUTAR npm ci, lint, typecheck, test e build
    REGISTRAR resultados reais no PR
    SE teste com celular não executado: marcar validação física como pendente
FIM
\`\`\`

## 12. Critérios de aceite e negative prompt

**Aceite verificável:** criação de sessão isolada; QR verdadeiro quando há HTTPS; um único emissor; tokens de 256 bits aleatórios (superam mínimo de 128 bits); expiração e rotação; controle de papéis; roteamento restrito de RTC; retomada protegida; encerramento revoga credenciais; testes de corrida, CORS/origem e segurança passam.

**Não entregar:** WebRTC funcionando sem mídia real, vídeo em Socket.IO, QR fictício, sockets de sessão pública, broadcast entre sessões, token somente UUID sequencial, credenciais em log ou URL de retomada, base de dados, login, terceiros pagos, frontend exibindo “Ao vivo” antes de receber quadros, alterações sem registro no grafo JSON exigido por \`AGENTS.md\`.

**Handoff para #3:** contrato estável de signaling com \`negotiationEpoch\`, papéis e eventos. A próxima issue poderá abrir \`RTCPeerConnection\` sem reimplementar controle de sessão.
