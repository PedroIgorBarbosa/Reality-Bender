import { existsSync } from 'node:fs';
import { createHttpApplication } from './app';
import { ConfigurationError, parseServerConfig } from './config/env';
import { attachSystemSocket } from './realtime/system-socket';

async function boot(): Promise<void> {
  if (existsSync('.env') && typeof process.loadEnvFile === 'function') {
    process.loadEnvFile('.env');
  }
  const config = parseServerConfig(process.env);
  const { httpServer } = createHttpApplication(config);
  const io = attachSystemSocket(httpServer, config);

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    httpServer.once('error', onError);
    httpServer.listen(config.port, config.host, () => {
      httpServer.off('error', onError);
      resolve();
    });
  });
  console.info('[server] Sinalização iniciada na porta ' + config.port + ' (' + config.nodeEnv + ')');

  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    const forceClose = setTimeout(() => httpServer.closeAllConnections?.(), 5000);
    forceClose.unref();
    void (async () => {
      try {
        await new Promise<void>((resolve) => io.close(() => resolve()));
        if (httpServer.listening) {
          await new Promise<void>((resolve, reject) =>
            httpServer.close((error) => (error ? reject(error) : resolve())),
          );
        }
      } catch {
        process.exitCode = 1;
        console.error('[server] Erro ao fechar conexões.');
      } finally {
        clearTimeout(forceClose);
        process.off('SIGINT', shutdown);
        process.off('SIGTERM', shutdown);
      }
    })();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

boot().catch((error: unknown) => {
  if (error instanceof ConfigurationError) {
    console.error('[config] ' + error.variable + ': ' + error.code);
  } else if ((error as NodeJS.ErrnoException)?.code === 'EADDRINUSE') {
    console.error('[server] PORT: porta ocupada');
  } else if (error instanceof Error && error.message === 'FRONTEND_NOT_BUILT') {
    console.error('[server] Frontend não compilado: execute npm run build');
  } else {
    console.error('[server] Falha de inicialização');
  }
  process.exitCode = 1;
});
