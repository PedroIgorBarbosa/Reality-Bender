#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const build = spawn(process.execPath, [join(ROOT, 'scripts/build-server.mjs')], { cwd: ROOT, stdio: 'inherit' });
build.on('exit', (code) => {
  if (code !== 0) process.exit(code ?? 1);
  const srv = spawn(process.execPath, [join(ROOT, 'dist/server/server/index.js')], {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV || 'development',
      CLIENT_ORIGINS: process.env.CLIENT_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000',
    },
  });
  srv.on('exit', (c) => process.exit(c ?? 0));
});
