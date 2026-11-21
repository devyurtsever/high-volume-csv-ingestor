import type { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 300;

const clients = new Map<string, RateLimitRecord>();

/* Süresi dolan eski IP kayıtlarını her 5 dakikada bir bellekten temizler */
setInterval(
  () => {
    const now = Date.now();
    for (const [ip, record] of clients.entries()) {
      if (now > record.resetTime) {
        clients.delete(ip);
      }
    }
  },
  5 * 60 * 1000,
).unref();

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown-ip';
  const now = Date.now();

  let record = clients.get(ip);
  /* Yeni gelen IP veya süresi dolmuş sayaç için yeni kota penceresi açar */
  if (!record || now > record.resetTime) {
    record = {
      count: 0,
      resetTime: now + WINDOW_MS,
    };
    clients.set(ip, record);
  }

  record.count += 1;

  const remaining = Math.max(0, MAX_REQUESTS - record.count);
  const resetSeconds = Math.ceil((record.resetTime - now) / 1000);

  /* Standart hız sınırlama HTTP başlıklarını cevaba ekler */
  res.setHeader('X-RateLimit-Limit', MAX_REQUESTS);
  res.setHeader('X-RateLimit-Remaining', remaining);
  res.setHeader('X-RateLimit-Reset', resetSeconds);

  /* Kota aşıldığında 429 Too Many Requests ile isteği durdurur */
  if (record.count > MAX_REQUESTS) {
    res.status(429).json({
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many requests, please try again later.',
        details: { retryAfterSeconds: resetSeconds },
      },
    });
    return;
  }

  next();
}
