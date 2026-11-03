# REALITY BENDER

Experiência audiovisual interativa **em tempo real**: a câmera do celular transmite vídeo via WebRTC para o navegador do computador conectado a um data-show. O PC executa rastreamento de mãos e corpo com MediaPipe e renderiza, sobre o vídeo ao vivo, três efeitos em Three.js/WebGL:

- **Esfera de energia:** acompanha duas mãos e reage à distância entre elas.
- **Portal dimensional:** acompanha a posição e orientação da mão.
- **Aura elétrica:** acompanha a silhueta e os movimentos corporais.

## Estado atual

Este repositório contém a **especificação de requisitos**, preparada para orientar a implementação. **Ainda não contém a aplicação executável.** Não confundir documentação com produto implementado.

## Documento de referência

- [`docs/REALITY_BENDER_ERS_v1.0.md`](docs/REALITY_BENDER_ERS_v1.0.md) — requisitos funcionais, não funcionais, contratos, estados, cenários de teste, plano de dois dias e condições de aceite.
- [`AGENTS.md`](AGENTS.md) — instruções para agentes de desenvolvimento.

## Arquitetura alvo

1. `/stage` no PC: cria sessão, exibe QR Code, recebe vídeo WebRTC e renderiza o resultado em tela cheia.
2. `/control` no celular: recebe convite, solicita permissão para a câmera, exibe prévia e envia o vídeo.
3. Servidor de sinalização: sessões efêmeras, WebSocket e negociação SDP/ICE. Não processa mídia.
4. Processamento local no PC: MediaPipe Hand/Pose Landmarker, Three.js, shaders, partículas e efeitos.

**Restrições:** sem vídeo pré-gravado simulando transmissão; não exigir microfone nem APIs pagas; câmera do celular somente sob HTTPS; priorizar o fluxo completo antes de refinamentos visuais.

## Como desenvolver

Leia a especificação integralmente e siga os requisitos P0. A implementação será considerada pronta somente após teste real com celular, Wi-Fi, PC e data-show. FPS e latência são metas de medição, não resultados presumidos.

## Licença

Não definida. A ausência de arquivo LICENSE não concede automaticamente permissão para reutilização do código.
