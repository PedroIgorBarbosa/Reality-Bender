#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const parser = require('/usr/share/nodejs/@babel/parser');
const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');

function collectFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) collectFiles(full, out);
    else if (['.ts', '.tsx'].includes(extname(full))) out.push(full);
  }
  return out;
}

function resolveImportPath(fromFile, spec) {
  let base = null;
  if (spec.startsWith('.')) {
    base = resolve(dirname(fromFile), spec);
  } else if (spec.startsWith('@client/')) {
    base = resolve(ROOT, 'src/client', spec.slice('@client/'.length));
  } else if (spec.startsWith('@server/')) {
    base = resolve(ROOT, 'src/server', spec.slice('@server/'.length));
  } else if (spec.startsWith('@shared/')) {
    base = resolve(ROOT, 'src/shared', spec.slice('@shared/'.length));
  } else {
    return true;
  }
  const stripped = base.replace(/\.(js|mjs)$/, '');
  const candidates = [
    base,
    stripped + '.ts',
    stripped + '.tsx',
    stripped + '.js',
    join(stripped, 'index.ts'),
    join(stripped, 'index.tsx'),
  ];
  return candidates.some((c) => existsSync(c));
}

const files = [...collectFiles(join(ROOT, 'src')), ...collectFiles(join(ROOT, 'tests'))];
const errors = [];

for (const file of files) {
  const code = readFileSync(file, 'utf8');
  const isTsx = file.endsWith('.tsx');
  try {
    const ast = parser.parse(code, {
      sourceType: 'module',
      plugins: isTsx ? ['typescript', 'jsx'] : ['typescript'],
    });
    for (const node of ast.program.body) {
      if (node.type === 'ImportDeclaration' || (node.type === 'ExportNamedDeclaration' && node.source) || node.type === 'ExportAllDeclaration') {
        const spec = node.source?.value;
        if (typeof spec === 'string' && !resolveImportPath(file, spec)) {
          errors.push(`${file}: import não resolvido "${spec}"`);
        }
      }
    }
  } catch (err) {
    errors.push(`${file}: erro de sintaxe/tipo TS: ${err.message}`);
  }
}

if (errors.length > 0) {
  for (const e of errors) console.error('[typecheck]', e);
  process.exit(1);
}
console.log(`[typecheck] OK (${files.length} arquivos TypeScript verificados com sucesso)`);
