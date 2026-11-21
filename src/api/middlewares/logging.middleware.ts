import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { pinoHttp } from 'pino-http';
import { logger } from '../../shared/logger.js';

export const loggingMiddleware = pinoHttp({
  logger,
  /* İstemciden gelen x-request-id varsa onu kullanır yoksa yeni bir UUID fiş numarası üretir */
  genReqId: (req: IncomingMessage) => {
    const existingId = req.headers['x-request-id'];
    if (existingId && typeof existingId === 'string') {
      return existingId;
    }
    return crypto.randomUUID();
  },
  /* durum koduna göre log seviyesini otomatik belirler (500: error, 400: warn, 200: info) */
  customLogLevel: (_req: IncomingMessage, res: ServerResponse, err?: Error) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
});
