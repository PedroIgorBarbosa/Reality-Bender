#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');

function collectFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) collectFiles(full, out);
    else if (['.ts', '.tsx', '.mjs'].includes(extname(full))) out.push(full);
  }
  return out;
}

const files = [
  ...collectFiles(join(ROOT, 'src')),
  ...collectFiles(join(ROOT, 'tests')),
  ...collectFiles(join(ROOT, 'scripts')),
];
const violations = [];
const forbiddenEvalPattern = new RegExp('\\b' + 'ev' + 'al\\s*\\(');

for (const file of files) {
  const content = readFileSync(file, 'utf8');
  if (content.includes('\0')) {
    violations.push(`${file}: contém byte nulo inválido`);
  }
  if (forbiddenEvalPattern.test(content)) {
    violations.push(`${file}: uso proibido de avaliação dinâmica`);
  }
}

if (violations.length > 0) {
  for (const v of violations) console.error('[lint]', v);
  process.exit(1);
}
console.log(`[lint] OK (${files.length} arquivos inspecionados sem violações)`);
