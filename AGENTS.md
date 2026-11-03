# Instruções para agentes — REALITY BENDER

## Objetivo

Implementar o produto final descrito em `docs/REALITY_BENDER_ERS_v1.0.md`. Leia esse documento por inteiro antes de alterar código. A especificação prevalece sobre suposições.
## Regras obrigatórias
não ler o projeto inteiro antes de executar cada projeto.
consultar no indice de conhecimento. 

## Regras obrigatórias do escopo

- O vídeo deve sair da câmera real do celular, via WebRTC, até o navegador do PC.
- MediaPipe executa reconhecimento de mãos e corpo sobre os quadros ao vivo; Three.js/WebGL compõe esfera de energia, portal dimensional e aura elétrica sobre a imagem.
- Não substituir a câmera por vídeo, GIF, canvas animado independente, screenshots periódicos ou simulações disfarçadas.
- Não ignorar permissões, HTTPS, segurança dos convites, estados de conexão, encerramento de recursos e reconexão.
- Desenvolver os requisitos P0 integralmente e seus testes de aceite. Requisitos P1 só após todos os P0 funcionarem.
- Implementar controles manuais de fallback e modos de qualidade para apresentações.
- Não adicionar serviços pagos, IA generativa externa, autenticação de usuários ou banco de dados sem necessidade e justificativa documentada.
- Não alegar testes, FPS, latência ou compatibilidade que não tenham sido medidos.

## Ordem de execução

1. Sessão efêmera, QR Code, conexão segura entre `/control` e `/stage`.
2. Captura de câmera real + WebRTC ponta a ponta + vídeo ao vivo em `/stage`.
3. MediaPipe para mãos e pose, mapeamento e suavização de coordenadas.
4. Esfera controlada em tempo real; em seguida portal e aura.
5. Estados, tratamento de erros, controles, diagnóstico, otimizações e testes.
6. Teste completo em dispositivos físicos, relatório de resultados e README de operação.

## Critérios de entrega

O código deve incluir scripts reproduzíveis de instalação, execução, build, checagens e testes; instruções de HTTPS para celular; e registro objetivo de testes reais feitos ou ainda pendentes. Nenhum RF P0 pode ficar vazio, inerte ou apenas demonstrativo.
