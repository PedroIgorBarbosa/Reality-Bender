# REALITY BENDER

Experiência audiovisual interativa **em tempo real**: a câmera do celular transmite vídeo via WebRTC para o navegador do computador conectado a um data-show. O PC executa rastreamento de mãos e corpo com MediaPipe e renderiza, sobre o vídeo ao vivo, três efeitos em Three.js/WebGL:

- **Esfera de energia:** acompanha duas mãos e reage à distância entre elas.
- **Portal dimensional:** acompanha a posição e orientação da mão.
- **Aura elétrica:** acompanha a silhueta e os movimentos corporais.

## Estado atual

Este repositório contém a **especificação de requisitos** e a infraestrutura de memória em grafo para agentes. **Ainda não contém a aplicação executável.** Não confundir documentação com produto implementado.

## Documento de referência

- [`docs/REALITY_BENDER_ERS_v1.0.md`](docs/REALITY_BENDER_ERS_v1.0.md) — requisitos funcionais, não funcionais, contratos, estados, cenários de teste, plano de dois dias e condições de aceite.
- [`AGENTS.md`](AGENTS.md) — instruções para agentes de desenvolvimento e protocolo obrigatório de memória.
- [`docs/specs/ISSUE-001-FUNDACAO-PSEUDOCODIGO.md`](docs/specs/ISSUE-001-FUNDACAO-PSEUDOCODIGO.md) — contrato de implementação da fundação do projeto (issue #1).
- [`documentos de contexto/graph-record.schema.json`](documentos%20de%20contexto/graph-record.schema.json) — contrato JSON dos eventos de conhecimento.

## Arquitetura alvo

1. `/stage` no PC: cria sessão, exibe QR Code, recebe vídeo WebRTC e renderiza o resultado em tela cheia.
2. `/control` no celular: recebe convite, solicita permissão para a câmera, exibe prévia e envia o vídeo.
3. Servidor de sinalização: sessões efêmeras, WebSocket e negociação SDP/ICE. Não processa mídia.
4. Processamento local no PC: MediaPipe Hand/Pose Landmarker, Three.js, shaders, partículas e efeitos.

**Restrições:** sem vídeo pré-gravado simulando transmissão; não exigir microfone nem APIs pagas; câmera do celular somente sob HTTPS; priorizar o fluxo completo antes de refinamentos visuais.

## Memória de contexto em grafo

O diretório `documentos de contexto/registros/` guarda arquivos JSON **imutáveis**, um por ação. Cada registro indica quais arquivos foram alterados e como se relacionam com outros arquivos. A consulta reconstrói nós de ações (`action:<id>`), nós de arquivos (`file:<caminho>`) e relações direcionadas, sem dependências ou banco de dados externo.

Requer Node.js 20 ou superior. Exemplos:

```bash
# Consulta por tema ou arquivo; retorna só a vizinhança do grafo
node scripts/context-graph.mjs query --text "WebRTC" --depth 2 --limit 30
node scripts/context-graph.mjs query --file "AGENTS.md" --depth 2 --format compact

# Histórico auditável de um arquivo
node scripts/context-graph.mjs history --file "AGENTS.md"

# Verificação estrutural dos registros
node scripts/context-graph.mjs validate

# Testes da ferramenta de memória
node --test tests/context-graph.test.mjs

# Ajuda para registrar uma alteração
node scripts/context-graph.mjs help
```

Os comandos, as regras de preenchimento e o fluxo obrigatório antes/depois de cada tarefa estão no `AGENTS.md`. A ausência de um item no grafo não prova ausência de código; confira os arquivos reais e o Git. Os registros documentam trabalho, mas não substituem os testes da aplicação.

## Como desenvolver

Leia a especificação integralmente e siga os requisitos P0. A implementação será considerada pronta somente após teste real com celular, Wi-Fi, PC e data-show. FPS e latência são metas de medição, não resultados presumidos.

## Licença

Não definida. A ausência de arquivo LICENSE não concede automaticamente permissão para reutilização do código.
