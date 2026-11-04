# REALITY BENDER

O REALITY BENDER é uma aplicação web planejada para apresentações audiovisuais interativas em tempo real. O objetivo final é receber vídeo real do celular por WebRTC, rastrear mãos e corpo com MediaPipe e compor três efeitos com Three.js/WebGL no PC: esfera de energia, portal dimensional e aura elétrica.

## Estado de implementação

A **issue #1** implementa a fundação: duas interfaces React (/stage para o PC e /control para o celular), API HTTP de saúde, servidor Socket.IO, teste tipado de handshake (system:ready + system:ping), reconexão, testes automatizados e build de produção.

**Ainda não implementado:** criação de sessão, QR Code/convites, autorização de câmera, prévia de vídeo, WebRTC, rastreamento, tela cheia de vídeo e os efeitos. Os botões correspondentes ficam desabilitados por design. O status "Servidor conectado" indica apenas que a sinalização foi testada, não que uma câmera está transmitindo.

## Instalação e desenvolvimento

Requisitos: Node.js **22.12 ou superior** e npm compatível.

~~~bash
npm ci
cp .env.example .env
npm run dev
~~~

O comando npm run dev inicia Vite em http://127.0.0.1:5173 e Express/Socket.IO em http://127.0.0.1:3000. No computador, abra http://localhost:5173/stage. Para testar o layout de controle pelo desktop, abra http://localhost:5173/control. A mesma origem aparente do Vite faz proxy de /api e /socket.io para o backend.

O arquivo .env é obrigatório para configurar CLIENT_ORIGINS. Nenhuma credencial é necessária. Os valores de .env.example são apropriados somente para desenvolvimento local.

Variáveis:

| Nome | Uso |
|---|---|
| NODE_ENV | development, test ou production |
| HOST | Interface de rede à qual o backend se vincula; padrão 127.0.0.1 |
| PORT | Porta do backend; padrão 3000 |
| CLIENT_ORIGINS | Lista explícita, separada por vírgulas, de origens permitidas para Socket.IO |
| PUBLIC_BASE_URL | URL pública opcional nesta etapa, reservada ao convite da issue #2 |

Se o servidor não iniciar, confira se PORT está livre e se todas as origens foram incluídas na allowlist. Origens HTTP remotas são rejeitadas; em produção, use origens HTTPS.

## Compilação de produção

~~~bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run start
~~~

Em produção, configure antes NODE_ENV=production, HOST, PORT e CLIENT_ORIGINS com **origem HTTPS real**. O Express serve dist/client e fornece fallback de navegação para /stage e /control. O endpoint GET /api/health responde com status ok, serviço reality-bender-signaling e protocolVersion 1, sem variáveis internas.

O CI em .github/workflows/ci.yml executa instalação limpa, lint, typecheck, testes, build e smoke HTTP. No primeiro push da branch da fundação, há uma etapa única de geração de package-lock.json pelo npm, com registro de contexto em grafo. Depois, o lockfile versionado é obrigatório em todos os builds.

## HTTPS no celular

O uso **futuro da câmera** em Chrome Android depende de origem segura, normalmente HTTPS com certificado confiável. Um endereço http://192.168.x.x não deve ser considerado seguro para getUserMedia. Ao publicar, configure domínio HTTPS ou túnel/reverse proxy confiável com upgrade WebSocket e inclua essa origem em CLIENT_ORIGINS. Não desative proteções do navegador nem instale certificados inseguros manualmente.

Nesta issue, o celular pode ser usado apenas para visualizar o layout. Permissão de câmera não é solicitada.

## Estrutura de projeto

- src/shared/: contratos de eventos e estados discriminados.
- src/server/: configuração de ambiente, HTTP, Socket.IO e ciclo de vida.
- src/client/: páginas, componentes de status, hook de conexão e estilos.
- tests/: verificações de ambiente, máquina de estados, HTTP, Socket.IO e interface.
- docs/specs/ISSUE-001-FUNDACAO-PSEUDOCODIGO.md: contrato técnico da issue #1.
- docs/REALITY_BENDER_ERS_v1.0.md: requisitos superiores do produto final.
- AGENTS.md: instruções obrigatórias e protocolo do grafo.

## Memória em grafo

Todos os arquivos de documentos de contexto/registros/ são eventos JSON imutáveis. Cada registro descreve alterações de arquivos, relações entre arquivos e evidências de verificações, sem guardar vídeo ou credenciais.

~~~bash
node scripts/context-graph.mjs query --text "Socket.IO" --depth 2 --limit 30
node scripts/context-graph.mjs query --file "AGENTS.md" --depth 2 --format compact
node scripts/context-graph.mjs history --file "AGENTS.md"
node scripts/context-graph.mjs validate
node --test tests/context-graph.test.mjs
~~~

A memória é auxiliar; o estado do código e os resultados de teste são a fonte de verdade.

## Próximas entregas

A issue #2 adiciona sessões efêmeras, convites seguros e QR Code. A issue #3 conecta câmera real e WebRTC. As demais implementam o vídeo projetado, MediaPipe, os três efeitos e a operação completa. Validações com celular, PC e data-show permanecem pendentes até a implementação desses recursos.

## Licença

Não definida.
