import type { Request, Response } from 'express';

/* Sistemde tanımlı olmayan bir URL veya HTTP metoduna istek gelirse standart 404 döner */
export function notFoundMiddleware(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Cannot ${req.method} ${req.originalUrl}`,
    },
  });
}
