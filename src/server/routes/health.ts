import type { Express } from 'express';
import { SIGNAL_PROTOCOL_VERSION, SIGNAL_SERVICE_NAME } from '../../shared/contracts/system-events';

export function registerHealthRoute(app: Express): void {
  app.get('/api/health', (_request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.status(200).json({
      status: 'ok',
      service: SIGNAL_SERVICE_NAME,
      protocolVersion: SIGNAL_PROTOCOL_VERSION,
    });
  });
}
