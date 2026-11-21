import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env.js';
import { UnauthorizedError } from '../../shared/errors.js';

/* Express Request nesnesine kimliği doğrulanmış kullanıcı contextini yani ownerId bilgisini ekler */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        ownerId: string;
      };
    }
  }
}

export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'];

  /* İstekte API anahtarı hiç yoksa veya string değilse 401 Unauthorized döner */
  if (!apiKey || typeof apiKey !== 'string') {
    throw new UnauthorizedError('Invalid or missing API key. Provide a valid X-API-Key header.');
  }

  const keyBuffer = Buffer.from(apiKey);
  const expectedBuffer = Buffer.from(env.API_KEY);

  /* Karakter süresi ölçen zamanlama saldırılarını (timing attack) önlemek için sabit zamanlı kıyaslama */
  if (
    keyBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(keyBuffer, expectedBuffer)
  ) {
    throw new UnauthorizedError('Invalid or missing API key. Provide a valid X-API-Key header.');
  }

  /* API anahtarını açık etmeden veritabanı için SHA-256 tabanlı tek yönlü ownerId üretir */
  req.user = {
    ownerId: crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 16),
  };

  next();
}
