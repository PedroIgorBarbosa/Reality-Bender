#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { compileTree } from './build-server.mjs';

const require = createRequire(import.meta.url);
const babel = require('/usr/share/nodejs/@babel/core');
const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const CACHE = join(ROOT, 'node_modules/.cache-tests');

rmSync(CACHE, { recursive: true, force: true });
mkdirSync(join(CACHE, 'src'), { recursive: true });
mkdirSync(join(CACHE, 'tests'), { recursive: true });
writeFileSync(join(CACHE, 'package.json'), JSON.stringify({ type: 'module' }, null, 2) + '\n', 'utf8');

compileTree(join(ROOT, 'src'), join(CACHE, 'src'));

function rewriteTestImports(code, testFileDir, outTestFileDir) {
  return code.replace(
    /((?:from|import)\s+['"])([^'"]+)(['"])/g,
    (full, prefix, spec, suffix) => {
      let resolvedSpec = spec;
      if (spec.startsWith('@shared/')) {
        const target = join(CACHE, 'src/shared', spec.slice('@shared/'.length));
        resolvedSpec = relative(outTestFileDir, target).replace(/\\/g, '/');
        if (!resolvedSpec.startsWith('.')) resolvedSpec = './' + resolvedSpec;
      } else if (spec.startsWith('@server/')) {
        const target = join(CACHE, 'src/server', spec.slice('@server/'.length));
        resolvedSpec = relative(outTestFileDir, target).replace(/\\/g, '/');
        if (!resolvedSpec.startsWith('.')) resolvedSpec = './' + resolvedSpec;
      } else if (spec.startsWith('@client/')) {
        const target = join(CACHE, 'src/client', spec.slice('@client/'.length));
        resolvedSpec = relative(outTestFileDir, target).replace(/\\/g, '/');
        if (!resolvedSpec.startsWith('.')) resolvedSpec = './' + resolvedSpec;
      } else if (spec.startsWith('.')) {
        const absTarget = resolve(testFileDir, spec);
        const relToRoot = relative(ROOT, absTarget).replace(/\\/g, '/');
        const mappedTarget = join(CACHE, relToRoot);
        resolvedSpec = relative(outTestFileDir, mappedTarget).replace(/\\/g, '/');
        if (!resolvedSpec.startsWith('.')) resolvedSpec = './' + resolvedSpec;
      }
      if (resolvedSpec.startsWith('.') && !/\.(js|mjs|json)$/.test(resolvedSpec)) {
        resolvedSpec += '.js';
      }
      return `${prefix}${resolvedSpec}${suffix}`;
    },
  );
}

const compiledTests = [join(ROOT, 'tests/context-graph.test.mjs')];

function compileTests(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      compileTests(full);
    } else if (/\.(test|spec)\.(ts|tsx)$/.test(entry)) {
      const rel = relative(join(ROOT, 'tests'), full).replace(/\.(tsx|ts)$/, '.js');
      const dest = join(CACHE, 'tests', rel);
      mkdirSync(dirname(dest), { recursive: true });
      const raw = readFileSync(full, 'utf8');
      const presets = [
        ['/usr/share/nodejs/@babel/preset-typescript', { isTSX: full.endsWith('.tsx'), allExtensions: true }],
      ];
      if (full.endsWith('.tsx')) {
        presets.push(['/usr/share/nodejs/@babel/preset-react', { runtime: 'automatic' }]);
      }
      const transformed = babel.transformSync(raw, {
        filename: full,
        presets,
        sourceMaps: false,
      });
      const finalCode = rewriteTestImports(transformed.code || '', dirname(full), dirname(dest));
      writeFileSync(dest, finalCode, 'utf8');
      compiledTests.push(dest);
    }
  }
}

compileTests(join(ROOT, 'tests'));

const res = spawnSync(process.execPath, ['--test', ...compiledTests], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'test' },
});

process.exit(res.status ?? 1);
