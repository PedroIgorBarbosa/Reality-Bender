#!/usr/bin/env node
/** Memória de execução em JSON, com nós de ação/arquivo e arestas direcionadas. Sem dependências. */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STORE = join(ROOT, 'documentos de contexto', 'registros');
const CHANGES = new Set(['created', 'modified', 'deleted', 'renamed', 'reviewed', 'tested']);
const LINKS = new Set([
  'depends_on', 'implements', 'uses', 'tests', 'documents', 'configures',
  'invokes', 'references', 'relates_to', 'supersedes', 'governed_by',
  'imports', 'renders', 'communicates_with',
]);
const STATUSES = new Set(['done', 'partial', 'blocked']);
const CHECKS = new Set(['passed', 'failed', 'not_run']);

function fail(message) { throw new Error(message); }
function requiredString(value, field) {
  if (typeof value !== 'string' || !value.trim()) fail(`${field}: texto obrigatório`);
}
function validPath(value, field) {
  requiredString(value, field);
  if (value !== value.trim() || value.includes('\\') || value.includes('\0') ||
      value.startsWith('/') || value.startsWith('./') || value.includes(':') ||
      posix.normalize(value) !== value || value.split('/').includes('..') ||
      value.endsWith('/')) fail(`${field}: caminho relativo POSIX inválido: ${value}`);
  return value;
}
function validateRecord(record, name) {
  const context = name ?? 'registro';
  if (!record || typeof record !== 'object' || Array.isArray(record)) fail(`${context}: objeto JSON obrigatório`);
  if (record.schemaVersion !== 1) fail(`${context}: schemaVersion deve ser 1`);
  if (typeof record.id !== 'string' || !/^[a-z0-9][a-z0-9-]{7,}$/.test(record.id)) fail(`${context}: id inválido`);
  if (typeof record.recordedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(record.recordedAt) ||
      Number.isNaN(Date.parse(record.recordedAt)) || new Date(record.recordedAt).toISOString() !== record.recordedAt) fail(`${context}: recordedAt deve ser data ISO UTC`);
  requiredString(record.agent, `${context}.agent`);
  requiredString(record.intent, `${context}.intent`);
  requiredString(record.summary, `${context}.summary`);
  if (!STATUSES.has(record.status)) fail(`${context}: status inválido`);
  if (!Array.isArray(record.files) || record.files.length === 0) fail(`${context}: files deve conter ao menos um arquivo`);
  const paths = new Set();
  for (const [index, file] of record.files.entries()) {
    const prefix = `${context}.files[${index}]`;
    if (!file || typeof file !== 'object') fail(`${prefix}: objeto obrigatório`);
    validPath(file.path, `${prefix}.path`);
    if (file.path.startsWith('documentos de contexto/registros/')) fail(`${prefix}: não registrar o próprio registro recursivamente`);
    if (paths.has(file.path)) fail(`${prefix}: arquivo repetido ${file.path}`);
    paths.add(file.path);
    if (!CHANGES.has(file.change)) fail(`${prefix}: change inválido`);
    requiredString(file.summary, `${prefix}.summary`);
    if (!Array.isArray(file.links) || file.links.length === 0) fail(`${prefix}: cada arquivo precisa de ao menos uma relação`);
    for (const [j, link] of file.links.entries()) {
      if (!link || typeof link !== 'object') fail(`${prefix}.links[${j}]: objeto obrigatório`);
      validPath(link.to, `${prefix}.links[${j}].to`);
      if (file.path === link.to) fail(`${prefix}.links[${j}]: autorrelação proibida`);
      if (!LINKS.has(link.type)) fail(`${prefix}.links[${j}]: tipo de relação inválido`);
      requiredString(link.reason, `${prefix}.links[${j}].reason`);
    }
  }
  if (!Array.isArray(record.checks)) fail(`${context}: checks deve ser uma lista (pode ser vazia)`);
  for (const [i, check] of record.checks.entries()) {
    if (!check || typeof check !== 'object') fail(`${context}.checks[${i}]: objeto obrigatório`);
    requiredString(check.command, `${context}.checks[${i}].command`);
    if (!CHECKS.has(check.status)) fail(`${context}.checks[${i}]: status de teste inválido`);
    requiredString(check.notes, `${context}.checks[${i}].notes`);
  }
}
function loadRecords() {
  if (!existsSync(STORE)) fail(`Diretório ausente: ${STORE}`);
  const names = readdirSync(STORE).filter(name => name.endsWith('.json')).sort();
  const ids = new Set();
  const records = names.map(name => {
    let record;
    try { record = JSON.parse(readFileSync(join(STORE, name), 'utf8')); }
    catch (error) { fail(`${name}: JSON inválido: ${error.message}`); }
    validateRecord(record, name);
    if (name !== `${record.id}.json`) fail(`${name}: nome precisa coincidir com id`);
    if (ids.has(record.id)) fail(`${name}: id duplicado`);
    ids.add(record.id);
    return record;
  });
  return records.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt) || a.id.localeCompare(b.id));
}
function buildGraph(records) {
  const nodes = new Map();
  const edges = [];
  const fileNode = (path, summary = undefined, at = undefined) => {
    const id = `file:${path}`;
    const existing = nodes.get(id);
    nodes.set(id, {
      id, kind: 'file', path, summary: summary ?? existing?.summary ?? '',
      exists: existsSync(join(ROOT, path)), lastSeen: at ?? existing?.lastSeen ?? null,
    });
    return id;
  };
  for (const event of records) {
    const eventId = `action:${event.id}`;
    nodes.set(eventId, {
      id: eventId, kind: 'action', at: event.recordedAt, agent: event.agent,
      intent: event.intent, summary: event.summary, status: event.status,
    });
    for (const file of event.files) {
      const source = fileNode(file.path, file.summary, event.recordedAt);
      edges.push({ from: eventId, to: source, type: file.change, reason: file.summary, record: event.id });
      for (const link of file.links) {
        const target = fileNode(link.to);
        edges.push({ from: source, to: target, type: link.type, reason: link.reason, record: event.id });
      }
    }
  }
  return { nodes, edges };
}
function argsFor(argv) {
  const result = new Map();
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith('--') || i + 1 >= argv.length || argv[i + 1].startsWith('--')) fail(`Argumento inválido: ${key}`);
    if (!result.has(key)) result.set(key, []);
    result.get(key).push(argv[++i]);
  }
  return { one(key, fallback) {
    const vals = result.get(`--${key}`);
    if (vals?.length > 1) fail(`--${key} não pode ser repetido`);
    return vals?.[0] ?? fallback;
  }, many(key) { return result.get(`--${key}`) ?? []; } };
}
function parseParts(value, count, flag) {
  const parts = value.split('|');
  if (parts.length < count) fail(`${flag} exige ${count} campos separados por |`);
  const parsed = [...parts.slice(0, count - 1), parts.slice(count - 1).join('|')];
  if (parsed.some(part => !part.trim())) fail(`${flag}: campos vazios não permitidos`);
  return parsed;
}
function recordCommand(options) {
  const now = new Date().toISOString();
  const id = options.one('id', `evt-${now.replace(/\D/g, '').slice(0, 14)}-${randomBytes(4).toString('hex')}`);
  const files = options.many('file').map(value => {
    const [path, change, summary] = parseParts(value, 3, '--file');
    return { path, change, summary, links: [] };
  });
  for (const value of options.many('link')) {
    const [from, type, to, reason] = parseParts(value, 4, '--link');
    const file = files.find(entry => entry.path === from);
    if (!file) fail(`--link: origem ${from} não aparece em --file`);
    file.links.push({ to, type, reason });
  }
  const checks = options.many('check').map(value => {
    const [command, status, notes] = parseParts(value, 3, '--check');
    return { command, status, notes };
  });
  const event = {
    schemaVersion: 1, id, recordedAt: now, agent: options.one('agent'),
    intent: options.one('intent'), summary: options.one('summary'),
    status: options.one('status', 'done'), files, checks,
  };
  validateRecord(event, 'novo registro');
  mkdirSync(STORE, { recursive: true });
  const dest = join(STORE, `${id}.json`);
  writeFileSync(dest, `${JSON.stringify(event, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  process.stdout.write(`${dest}\n`);
}
function queryCommand(options, graph, records) {
  const file = options.one('file');
  const id = options.one('id');
  const term = options.one('text');
  if (!file && !id && !term) fail('query exige --file, --id ou --text');
  if (file) validPath(file, '--file');
  const depth = Number(options.one('depth', '2'));
  const limit = Number(options.one('limit', '40'));
  const direction = options.one('direction', 'both');
  const relation = options.one('relation');
  if (!Number.isInteger(depth) || depth < 0 || depth > 5) fail('--depth: esperado inteiro entre 0 e 5');
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) fail('--limit: esperado inteiro entre 1 e 200');
  if (!['both', 'in', 'out'].includes(direction)) fail('--direction: use both, in ou out');
  if (relation && ![...LINKS, ...CHANGES].includes(relation)) fail('--relation: tipo desconhecido');
  const matchingEdges = graph.edges.filter(e => !relation || e.type === relation);
  const seeds = [];
  if (file || id) {
    const identifier = file ? `file:${file}` : id;
    if (graph.nodes.has(identifier)) seeds.push(identifier);
  } else {
    const q = term.toLocaleLowerCase('pt-BR');
    for (const node of graph.nodes.values()) {
      if (JSON.stringify(node).toLocaleLowerCase('pt-BR').includes(q)) seeds.push(node.id);
    }
    for (const edge of matchingEdges) {
      if (edge.reason.toLocaleLowerCase('pt-BR').includes(q)) seeds.push(edge.from, edge.to);
    }
  }
  const neighbors = new Map();
  const connect = (from, to) => {
    if (!neighbors.has(from)) neighbors.set(from, []);
    neighbors.get(from).push(to);
  };
  for (const edge of matchingEdges) {
    if (direction !== 'in') connect(edge.from, edge.to);
    if (direction !== 'out') connect(edge.to, edge.from);
  }
  const start = [...new Set(seeds)].slice(0, limit);
  const visited = new Set(start);
  const queue = start.map(key => ({ key, distance: 0 }));
  while (queue.length && visited.size < limit) {
    const { key, distance } = queue.shift();
    if (distance >= depth) continue;
    for (const neighbor of neighbors.get(key) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push({ key: neighbor, distance: distance + 1 });
        if (visited.size >= limit) break;
      }
    }
  }
  const visibleEdges = matchingEdges.filter(edge => visited.has(edge.from) && visited.has(edge.to));
  const output = {
    filter: { file: file ?? null, id: id ?? null, text: term ?? null, relation: relation ?? null, depth, direction },
    matches: start, nodes: [...visited].map(key => graph.nodes.get(key)),
    edges: visibleEdges.slice(0, limit * 4),
    totals: { records: records.length, graphNodes: graph.nodes.size, graphEdges: graph.edges.length },
    truncated: seeds.length > start.length || visited.size >= limit || visibleEdges.length > limit * 4,
  };
  process.stdout.write(`${JSON.stringify(output, null, options.one('format', 'pretty') === 'compact' ? 0 : 2)}\n`);
}
function historyCommand(options, records) {
  const file = validPath(options.one('file'), '--file');
  const limit = Number(options.one('limit', '20'));
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) fail('--limit: esperado inteiro entre 1 e 200');
  const events = records.flatMap(event => event.files.filter(f => f.path === file)
    .map(f => ({ record: event.id, at: event.recordedAt, agent: event.agent, status: event.status,
      intent: event.intent, summary: event.summary, change: f.change, details: f.summary,
      links: f.links, checks: event.checks })));
  events.reverse();
  process.stdout.write(`${JSON.stringify({ file, total: events.length, events: events.slice(0, limit) }, null, 2)}\n`);
}
function validateCommand(records, graph) {
  const missing = [...graph.nodes.values()].filter(n => n.kind === 'file' && !n.exists).map(n => n.path);
  const response = { valid: true, records: records.length, nodes: graph.nodes.size,
    edges: graph.edges.length, missingHistoricalFiles: missing };
  process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
}
const HELP = `Uso: node scripts/context-graph.mjs <comando> [opções]

  query --file "src/stage.ts" --depth 2 [--direction both|in|out] [--relation uses] [--limit 40]
  query --text "WebRTC" --depth 2 [--format compact]
  query --id "action:evt-..." --depth 1
  history --file "src/stage.ts" [--limit 20]
  validate
  record --agent "Codex" --intent "RF-08" --summary "Conexão WebRTC" \
    --file "src/rtc.ts|created|Implementado envio de mídia" \
    --link "src/rtc.ts|implements|docs/REALITY_BENDER_ERS_v1.0.md|Atende RF-08" \
    --check "node --test|passed|8 testes executados"

--file, --link e --check podem ser repetidos. Cada --file exige >=1 --link.
Cada registro JSON é imutável; use um novo registro para correções, decisões e testes.
`;
try {
  const [command, ...argv] = process.argv.slice(2);
  if (!command || ['help', '-h', '--help'].includes(command)) process.stdout.write(HELP);
  else {
    const options = argsFor(argv);
    if (command === 'record') recordCommand(options);
    else {
      const records = loadRecords();
      const graph = buildGraph(records);
      if (command === 'validate') validateCommand(records, graph);
      else if (command === 'query') queryCommand(options, graph, records);
      else if (command === 'history') historyCommand(options, records);
      else fail(`Comando desconhecido: ${command}`);
    }
  }
} catch (error) {
  process.stderr.write(`Erro no grafo de contexto: ${error.message}\n`);
  process.exitCode = 1;
}
