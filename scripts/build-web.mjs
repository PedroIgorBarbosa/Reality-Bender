#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { compileTree } from './build-server.mjs';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const outDir = join(ROOT, 'dist/client');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, 'assets'), { recursive: true });

compileTree(join(ROOT, 'src'), join(outDir, 'assets'));

const cssPath = join(ROOT, 'src/client/styles/global.css');
if (existsSync(cssPath)) {
  copyFileSync(cssPath, join(outDir, 'assets/styles.css'));
} else {
  writeFileSync(join(outDir, 'assets/styles.css'), 'body { margin: 0; background: #05070e; color: #f5f7ff; font-family: system-ui, sans-serif; }\n', 'utf8');
}

const htmlTemplate = readFileSync(join(ROOT, 'index.html'), 'utf8')
  .replace('/src/client/main.tsx', '/assets/client/main.js');

writeFileSync(join(outDir, 'index.html'), htmlTemplate, 'utf8');
console.log('[build:web] Frontend compilado em dist/client');
