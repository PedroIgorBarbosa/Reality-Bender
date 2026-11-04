import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve } from 'node:path';
import express, { type ErrorRequestHandler } from 'express';
import type { ServerConfig } from './config/env';
import { registerHealthRoute } from './routes/health';

export function createHttpApplication(config: ServerConfig) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Frame-Options', 'DENY');
    next();
  });

  registerHealthRoute(app);
  app.use('/api', (_request, response) => {
    response.status(404).json({ error: 'NOT_FOUND', message: 'Rota de API inexistente.' });
  });

  if (config.nodeEnv === 'production') {
    const clientDir = resolve(process.cwd(), 'dist/client');
    const indexPath = resolve(clientDir, 'index.html');
    if (!existsSync(indexPath)) {
      throw new Error('FRONTEND_NOT_BUILT');
    }
    app.use(express.static(clientDir, { index: false }));
    app.use((request, response, next) => {
      if (
        request.method !== 'GET' ||
        request.path.startsWith('/api') ||
        request.path.startsWith('/socket.io') ||
        extname(request.path) !== '' ||
        !request.accepts('html')
      ) {
        next();
        return;
      }
      response.setHeader('Cache-Control', 'no-store');
      response.sendFile(indexPath);
    });
  }

  app.use((_request, response) => {
    response.status(404).json({ error: 'NOT_FOUND', message: 'Recurso inexistente.' });
  });

  const errorHandler: ErrorRequestHandler = (_error, _request, response, _next) => {
    void _error;
    void _request;
    void _next;
    if (response.headersSent) return;
    console.error('[http] INTERNAL_ERROR');
    response.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erro interno.' });
  };
  app.use(errorHandler);
  return { app, httpServer: createServer(app) };
}
