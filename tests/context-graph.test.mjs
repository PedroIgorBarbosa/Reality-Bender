import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'context-graph.mjs');
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'reality-bender-graph-'));
  mkdirSync(join(root, 'scripts'));
  mkdirSync(join(root, 'docs'));
  mkdirSync(join(root, 'documentos de contexto', 'registros'), { recursive: true });
  copyFileSync(SCRIPT, join(root, 'scripts', 'context-graph.mjs'));
  writeFileSync(join(root, 'AGENTS.md'), 'Regras de agentes\n');
  writeFileSync(join(root, 'docs', 'spec.md'), 'Contrato de WebRTC\n');
  return {
    root,
    run(...args) {
      const result = spawnSync(process.execPath, [join(root, 'scripts', 'context-graph.mjs'), ...args], { encoding: 'utf8' });
      if (result.error) throw result.error;
      return result;
    },
    cleanup() { rmSync(root, { recursive: true, force: true }); },
  };
}
function newRecord(f, summary = 'Atualizou instruções') {
  return f.run('record', '--agent', 'Codex', '--intent', 'Rastreabilidade', '--summary', summary,
    '--file', 'AGENTS.md|modified|Instruções de memória',
    '--link', 'AGENTS.md|documents|docs/spec.md|Referência à especificação',
    '--check', 'node --test|passed|Testes locais concluídos');
}

test('registra, valida e consulta um subgrafo por arquivo', () => {
  const f = fixture();
  try {
    const saved = newRecord(f);
    assert.equal(saved.status, 0, saved.stderr);
    const valid = f.run('validate');
    assert.equal(valid.status, 0, valid.stderr);
    assert.deepEqual(JSON.parse(valid.stdout).missingHistoricalFiles, []);
    const result = f.run('query', '--file', 'AGENTS.md', '--depth', '2', '--direction', 'both');
    assert.equal(result.status, 0, result.stderr);
    const graph = JSON.parse(result.stdout);
    assert.equal(graph.matches[0], 'file:AGENTS.md');
    assert(graph.nodes.some(n => n.id === 'file:docs/spec.md'));
    assert(graph.nodes.some(n => n.kind === 'action'));
    assert(graph.edges.some(e => e.type === 'documents' && e.from === 'file:AGENTS.md'));
    assert(graph.edges.some(e => e.type === 'modified' && e.to === 'file:AGENTS.md'));
  } finally { f.cleanup(); }
});

test('consulta textual encontra conteúdo de relação e pode filtrar direção', () => {
  const f = fixture();
  try {
    const record = f.run('record', '--agent', 'Codex', '--intent', 'DOC-01', '--summary', 'Registro inicial',
      '--file', 'AGENTS.md|reviewed|Revisão de instruções',
      '--link', 'AGENTS.md|references|docs/spec.md|Transporte WebRTC peer-to-peer');
    assert.equal(record.status, 0, record.stderr);
    const query = JSON.parse(f.run('query', '--text', 'WebRTC', '--depth', '0', '--format', 'compact').stdout);
    assert(query.matches.includes('file:AGENTS.md'));
    assert(query.matches.includes('file:docs/spec.md'));
    const outgoing = JSON.parse(f.run('query', '--file', 'AGENTS.md', '--depth', '1', '--direction', 'out').stdout);
    assert(outgoing.nodes.some(node => node.id === 'file:docs/spec.md'));
    assert(!outgoing.nodes.some(node => node.kind === 'action'));
  } finally { f.cleanup(); }
});

test('mantém histórico cronológico imutável por arquivo', () => {
  const f = fixture();
  try {
    assert.equal(newRecord(f, 'Primeira alteração').status, 0);
    assert.equal(newRecord(f, 'Segunda alteração').status, 0);
    const response = f.run('history', '--file', 'AGENTS.md');
    assert.equal(response.status, 0, response.stderr);
    const history = JSON.parse(response.stdout);
    assert.equal(history.total, 2);
    assert(history.events.some(x => x.summary === 'Primeira alteração'));
    assert(history.events.some(x => x.summary === 'Segunda alteração'));
  } finally { f.cleanup(); }
});

test('recusa ações sem relação e caminhos inseguros', () => {
  const f = fixture();
  try {
    const missing = f.run('record', '--agent', 'Codex', '--intent', 'Teste', '--summary', 'Sem links',
      '--file', 'AGENTS.md|modified|Alteração sem contexto');
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /precisa de ao menos uma relação/);
    const traversal = f.run('record', '--agent', 'Codex', '--intent', 'Teste', '--summary', 'Traversal',
      '--file', '../secret|modified|Arquivo externo', '--link', '../secret|uses|AGENTS.md|Inseguro');
    assert.notEqual(traversal.status, 0);
    assert.match(traversal.stderr, /caminho relativo POSIX inválido/);
  } finally { f.cleanup(); }
});

test('falha em registro JSON corrompido, sem retornar resultados incorretos', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.root, 'documentos de contexto', 'registros', 'corrupt.json'), '{INVALID');
    const response = f.run('query', '--file', 'AGENTS.md');
    assert.notEqual(response.status, 0);
    assert.match(response.stderr, /JSON inválido/);
  } finally { f.cleanup(); }
});
