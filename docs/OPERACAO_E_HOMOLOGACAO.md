# Manual de Operação e Relatório de Homologação — REALITY BENDER

## 1. Pré-requisitos e Instalação
- **Node.js**: `>= 22.12.0` (compatível com `>= 18.18.0` em ambiente de contingência).
- **Instalação de dependências**:
  ```bash
  npm ci
  ```

## 2. Variáveis de Ambiente Obrigatórias (`.env`)
Crie um arquivo `.env` na raiz do projeto (baseado em `.env.example`):
```ini
NODE_ENV=development
HOST=127.0.0.1
PORT=3000
CLIENT_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000
PUBLIC_BASE_URL=http://localhost:5173
```
- **Regras de validação (`src/server/config/env.ts`)**:
  - `PORT`: inteiro seguro entre `1` e `65535`.
  - `HOST`: IP ou hostname válido.
  - `CLIENT_ORIGINS`: lista separada por vírgula de origens HTTP/HTTPS sem caminho ou query string. Origens fora de `localhost`/`127.0.0.1` ou em `NODE_ENV=production` exigem obrigatoriamente `https://`.
  - `PUBLIC_BASE_URL`: URL base usada na geração do QR Code de pareamento; exige `https://` quando não for loopback.

## 3. Configuração de HTTPS/WSS para Celular
Navegadores móveis (Safari iOS e Chrome Android) exigem contexto seguro (`https://`) para liberar `navigator.mediaDevices.getUserMedia`:
1. Execute `npm run https:setup` para gerar o guia rápido em `.certs/HTTPS_SETUP_INSTRUCTIONS.md`.
2. **Em rede local (LAN)**: utilize `mkcert` para gerar certificados confiáveis para o IP da máquina do palco ou exponha a porta via túnel TLS confiável (`cloudflared tunnel --url http://127.0.0.1:3000` ou `tailscale funnel 3000`).
3. Atualize `CLIENT_ORIGINS` e `PUBLIC_BASE_URL` no `.env` com a URL `https://` pública/LAN.

## 4. Passo a Passo de Operação (Computador/Palco e Celular)
1. **Iniciar Servidor e Frontend**:
   - Em desenvolvimento: `npm run dev`
   - Em produção: `npm run build && npm start`
2. **No Computador conectado ao Projetor (`/stage`)**:
   - Abra `http://localhost:5173/stage` (ou a URL HTTPS configurada).
   - Clique em **"Criar sessão / QR Code"**. O palco exibirá o QR Code e o PIN de 6 dígitos (válido por 5 minutos).
   - Pressione `F` para ativar tela cheia e `D` para alternar o HUD de diagnóstico.
3. **No Celular (`/control`)**:
   - Escaneie o QR Code exibido no palco ou acesse `/control` e digite o PIN de 6 dígitos.
   - Após o status **"Sessão Pareada"**, toque no botão **"Iniciar Câmera e Transmitir (WebRTC)"** e conceda permissão de câmera ao navegador.
   - Utilize os botões do celular (`NONE`, `ENERGY`, `PORTAL`, `AURA`, `Alternar Câmera`, `Espelhamento`, `Qualidade`, `Recalibrar`) ou as teclas `0`, `1`, `2`, `3`, `M`, `Q`, `F` no palco.

## 5. Matriz de Homologação (CT-010-1 a CT-010-7 e CT-018-PHYSICAL)

| ID | Requisito(s) | Descrição | Status | Evidência / Observação |
| --- | --- | --- | --- | --- |
| **CT-010-1** | RF-01, RF-02, RF-03, RF-06, RNF-08, RNF-09 | Isolamento de sessão, token >= 128 bits, TTL 5 min e bloqueio de intruso | **PASS** | `tests/unit/session-manager.test.ts` e `tests/integration/socket.test.ts` |
| **CT-010-2** | RF-04, RF-05, RF-08, RF-09, RNF-07 | Negociação WebRTC P2P, fila de candidatos ICE e reconexão ICE restart | **PASS** | `tests/unit/webrtc-peer.test.ts` e `tests/integration/socket.test.ts` |
| **CT-010-3** | RF-10, RF-11, RF-22, RF-23 | Transformação geométrica `videoNormalizedToStage` (retrato/paisagem/mirror) | **PASS** | `tests/unit/projection-geometry.test.ts` |
| **CT-010-4** | RF-12, RF-14, RF-15, RF-16, RNF-04 | MediaPipe Hands/Pose, `OneEuroFilter`, calibração e backpressure (1 quadro em voo) | **PASS** | `tests/unit/gesture-engine.test.ts` |
| **CT-010-5** | RF-17, RF-18, RF-19, RF-20 | Reatividade 3D: Esfera (`ENERGY`), Portal (`PORTAL`) e Aura (`AURA`) | **PASS** | `tests/unit/effects-3d.test.ts` |
| **CT-010-6** | RF-24, RF-25, RNF-15 | Detecção de congelamento de vídeo (< 3s) e métricas FPS / P50 / P95 | **PASS** | `tests/unit/diagnostics-resilience.test.ts` |
| **CT-010-7** | RF-26, RNF-12, RNF-20 | Limpeza integral de tracks, peers, sockets e buffers WebGL no `dispose()` | **PASS** | `tests/unit/effects-3d.test.ts` e `tests/unit/webrtc-peer.test.ts` |
| **CT-018-PHYSICAL** | RF-04, RF-08, RF-10, RNF-01, RNF-02 | Teste físico com smartphone real + Wi-Fi + projetor externo | **BLOCKED** | Pendente de execução presencial com hardware físico (smartphone + data-show). |
