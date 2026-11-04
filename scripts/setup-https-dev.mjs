#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const certsDir = join(ROOT, '.certs');
mkdirSync(certsDir, { recursive: true });

const guide = `# Guia de Configuração HTTPS/WSS para Celular (Reality Bender)

Os navegadores móveis (Safari iOS e Chrome Android) exigem contexto seguro (\`https://\` ou \`wss://\`) para liberar \`navigator.mediaDevices.getUserMedia\`.

## Opção 1: Certificados Locais Confiáveis com \`mkcert\` (Mesma Rede Wi-Fi)
1. Instale a CA local no computador:
   \`\`\`bash
   mkcert -install
   mkcert -key-file .certs/dev-key.pem -cert-file .certs/dev-cert.pem localhost 127.0.0.1 ::1 <SEU_IP_LAN>
   \`\`\`
2. Instale o certificado \`rootCA.pem\` do \`mkcert -CAROOT\` no celular.
3. Configure \`.env\` com:
   \`\`\`ini
   CLIENT_ORIGINS=https://<SEU_IP_LAN>:5173,https://localhost:5173
   PUBLIC_BASE_URL=https://<SEU_IP_LAN>:5173
   \`\`\`

## Opção 2: Túnel HTTPS Automatizado (Cloudflare Tunnel / Tailscale Funnel / ngrok)
1. Inicie o servidor local: \`npm run build && npm start\`
2. Exponha a porta 3000 via túnel HTTPS com certificado público válido:
   \`\`\`bash
   cloudflared tunnel --url http://127.0.0.1:3000
   \`\`\`
3. Defina a URL \`https://*.trycloudflare.com\` em \`CLIENT_ORIGINS\` e \`PUBLIC_BASE_URL\`.
`;

writeFileSync(join(certsDir, 'HTTPS_SETUP_INSTRUCTIONS.md'), guide, 'utf8');
console.log('[https:setup] Instruções e diretório .certs preparados em .certs/HTTPS_SETUP_INSTRUCTIONS.md');
