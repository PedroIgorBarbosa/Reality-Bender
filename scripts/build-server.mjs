#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import ts from 'typescript';
import { dirname, extname, join, relative, resolve } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');

function rewriteImports(code, fileDir) {
  return code.replace(
    /((?:from|import)\s+['"])([^'"]+)(['"])/g,
    (full, prefix, spec, suffix) => {
      let resolvedSpec = spec;
      if (spec.startsWith('@shared/')) {
        const target = resolve(ROOT, 'src/shared', spec.slice('@shared/'.length));
        resolvedSpec = relative(fileDir, target).replace(/\\/g, '/');
        if (!resolvedSpec.startsWith('.')) resolvedSpec = './' + resolvedSpec;
      } else if (spec.startsWith('@server/')) {
        const target = resolve(ROOT, 'src/server', spec.slice('@server/'.length));
        resolvedSpec = relative(fileDir, target).replace(/\\/g, '/');
        if (!resolvedSpec.startsWith('.')) resolvedSpec = './' + resolvedSpec;
      } else if (spec.startsWith('@client/')) {
        const target = resolve(ROOT, 'src/client', spec.slice('@client/'.length));
        resolvedSpec = relative(fileDir, target).replace(/\\/g, '/');
        if (!resolvedSpec.startsWith('.')) resolvedSpec = './' + resolvedSpec;
      }
      if (resolvedSpec.startsWith('.')) {
        if (!/\.(js|mjs|json|css)$/.test(resolvedSpec)) {
          resolvedSpec += '.js';
        }
      }
      return `${prefix}${resolvedSpec}${suffix}`;
    },
  );
}

export function compileTree(srcRoot, outRoot) {
  function walk(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
      } else if (['.ts', '.tsx'].includes(extname(full))) {
        const rel = relative(srcRoot, full).replace(/\.(tsx|ts)$/, '.js');
        const dest = join(outRoot, rel);
        mkdirSync(dirname(dest), { recursive: true });
        const raw = readFileSync(full, 'utf8');
        const transformed = ts.transpileModule(raw, {
          fileName: full,
          compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
            jsx: ts.JsxEmit.ReactJSX,
          },
        });
        const finalCode = rewriteImports(transformed.outputText || '', dirname(full));
        writeFileSync(dest, finalCode, 'utf8');
      }
    }
  }
  walk(srcRoot);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outDir = join(ROOT, 'dist/server');
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  compileTree(join(ROOT, 'src'), outDir);
  console.log('[build:server] Servidor compilado em dist/server');
}
