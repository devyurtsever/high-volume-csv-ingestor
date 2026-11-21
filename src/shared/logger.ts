import pino from 'pino';
import { env } from '../config/env.js';

// Tüm sistemin kullandığı merkezi yüksek performanslı loglayıcı (Pino)
export const logger = pino({
  level: env.LOG_LEVEL,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
  // kvkk gizliliği için tasarlandı :
  // hassas müşteri verilerini (TCKN, e-posta, şifre) loglara basmadan önce otomatik gizler
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-api-key"]',
      'password',
      'national_id',
      'tckn',
      'email',
      'phone',
    ],
    censor: '[REDACTED]',
  },
});
