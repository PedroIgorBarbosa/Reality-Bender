# Instruções para agentes — REALITY BENDER

## Objetivo

Implementar o produto final descrito em `docs/REALITY_BENDER_ERS_v1.0.md`. Leia esse documento por inteiro antes de alterar código. A especificação prevalece sobre suposições.

## Regras obrigatórias

- Não ler o projeto inteiro antes de executar cada tarefa: consultar primeiro o índice de conhecimento, ampliando a leitura somente quando necessário.
- Não usar uma busca ampla como substituto para a consulta por arquivo e relação no grafo de contexto.

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

## Memória obrigatória de execução — grafo JSON

A pasta `documentos de contexto/` é a memória de trabalho versionada deste repositório. Ela **não é um banco de dados da aplicação**. Todos os documentos *dentro da pasta* são JSON: `graph-record.schema.json` define o contrato e `registros/<id>.json` contém eventos imutáveis. Cada evento identifica o agente, a intenção, o que realmente foi feito, o estado, os arquivos envolvidos, as relações com outros arquivos e os testes executados ou pendentes.

**Antes de cada tarefa:**

1. Consulte o subgrafo relevante em vez de carregar todo o histórico:
   - `node scripts/context-graph.mjs query --text "WebRTC" --depth 2`
   - `node scripts/context-graph.mjs query --file "AGENTS.md" --depth 2`
   - `node scripts/context-graph.mjs history --file "AGENTS.md"`
2. Leia os arquivos de código e requisitos retornados pela consulta (incluindo `docs/specs/ISSUE-001-FUNDACAO-PSEUDOCODIGO.md` quando pertinente); confira o estado real no Git e no código. O grafo é memória auxiliar, não prova de que algo funciona hoje.
3. Se o grafo ainda não tiver a funcionalidade, investigue no repositório normalmente; não deduza que não existe apenas porque não está indexada.

**Durante e depois da execução:**

1. Para cada unidade coerente de alteração, registre **todos os arquivos criados, modificados, removidos, renomeados, testados ou revisados** que sejam relevantes. Cada arquivo recebe `path`, `change` e um resumo específico, além de **ao menos uma aresta justificada** para outro arquivo (`links`: `to`, `type`, `reason`). Prefira a relação real (dependência, implementação de requisito, uso, teste, documentação), não uma conexão arbitrária para cumprir formalidade.
2. Registre o motivo, decisões, limites e resultados observados. Use `status=partial` ou `blocked` para trabalho não concluído; teste não realizado deve ser `not_run`, nunca `passed`. Não invente dependências, arquivos, commits, métricas ou verificações.
3. Crie o registro JSON **antes do commit**, preferencialmente pela CLI, e inclua-o no **mesmo commit** dos arquivos alterados. Não altere eventos antigos; para correções, crie evento novo. Trabalhos simultâneos devem gerar arquivos de evento distintos para evitar conflitos de merge.
4. Execute `node scripts/context-graph.mjs validate` e `node --test tests/context-graph.test.mjs` quando modificar a infraestrutura do grafo. Compare `git diff --name-status` com `files[]` para não omitir alterações. Um registro JSON não deve registrar a si mesmo recursivamente.
5. Não grave tokens, senhas, identificadores de sessão, dados pessoais, imagens ou quadros da câmera, SDP/ICE privados ou outros segredos no grafo. Registre somente caminhos, decisões técnicas e evidências seguras.

**Modelo de comando para registrar uma mudança** (repita `--file`, `--link` e `--check` conforme necessário):

```bash
node scripts/context-graph.mjs record \
  --agent "Codex" --intent "RF-08" \
  --summary "Transmissão WebRTC real do celular para o PC" --status "done" \
  --file "src/webrtc.ts|created|Implementado emissor de vídeo" \
  --link "src/webrtc.ts|implements|docs/REALITY_BENDER_ERS_v1.0.md|Implementa RF-08" \
  --check "node --test|passed|Suíte automatizada executada"
```

A sintaxe das relações e dos tipos de ação está em `documentos de contexto/graph-record.schema.json`. Use `--status partial` se somente parte da funcionalidade foi entregue; no exemplo acima, não marque um teste como aprovado se não o executou. Para reduzir consumo de contexto dos agentes, prefira `query --file` e `query --text` com `--depth 1` ou `2`, `--limit` e `--format compact` antes de ampliar a busca.
