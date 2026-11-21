import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../../shared/errors.js';
import { logger } from '../../shared/logger.js';

export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  /* Cevap başlıkları istemciye çoktan yazıldıysa işlemi express'in varsayılan işleyicisine devreder */
  if (res.headersSent) {
    return next(err);
  }

  /* Kod içinde fırlattığımız özel apperror'ları standart json'a dönüştürür */
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  /* Zod şema doğrulama hatalarını 400 Bad Request olarak formatlar */
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request parameters or query payload',
        details: err.flatten(),
      },
    });
    return;
  }

  /* express.json gövdesinde gönderilen bozuk JSON formatlarını 400 Bad Request yapar */
  if (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    (err as { type: string }).type === 'entity.parse.failed'
  ) {
    res.status(400).json({
      error: {
        code: 'BAD_REQUEST',
        message: 'Malformed JSON payload in request body',
      },
    });
    return;
  }

  /* beklenmeyen sistem hatalarını sunucuya loglar ve müşteriye stack trace sızdırmadan 500 döner */
  logger.error({ err }, 'Unhandled internal server error caught in error middleware');

  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal error occurred on the server',
    },
  });
}
