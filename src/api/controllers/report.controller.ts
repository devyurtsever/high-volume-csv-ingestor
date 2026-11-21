import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { ReportService } from '../../application/services/report.service.js';
import { UnauthorizedError } from '../../shared/errors.js';
import { logger } from '../../shared/logger.js';

const idParamSchema = z.object({
  id: z.string().uuid({ message: 'Import ID must be a valid UUID' }),
});

const errorsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  after_row: z.coerce.number().int().min(0).optional(),
  error_type: z.enum(['VALIDATION', 'DUPLICATE']).optional(),
});

const exportQuerySchema = z.object({
  chunk_size: z.coerce.number().int().min(1).max(10000).default(5000),
});

export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  getErrors = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const query = errorsQuerySchema.parse(req.query);

      const ownerId = req.user?.ownerId;
      if (!ownerId) {
        throw new UnauthorizedError('Authenticated user context is missing');
      }

      const result = await this.reportService.getErrors(id, ownerId, {
        limit: query.limit,
        afterRow: query.after_row,
        errorType: query.error_type,
      });

      res.status(200).json({
        data: result.items,
        pagination: {
          next_cursor: result.next_cursor,
          has_more: result.has_more,
          limit: query.limit,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  exportErrors = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    let id = '';
    try {
      const params = idParamSchema.parse(req.params);
      id = params.id;
      const query = exportQuerySchema.parse(req.query);

      const ownerId = req.user?.ownerId;
      if (!ownerId) {
        throw new UnauthorizedError('Authenticated user context is missing');
      }

      // Önceden sahiplik kontrolü yap: 404 ise akış başlamadan temiz JSON döner
      await this.reportService.verifyOwnership(id, ownerId);

      const generator = this.reportService.exportErrorsCsv(id, ownerId, query.chunk_size);

      // Başlıkları gönder
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="import-${id}-errors.csv"`);

      // Controller katmanında stream.pipeline ile HTTP akışı ve backpressure yönetimi
      const readable = Readable.from(generator);
      await pipeline(readable, res);
    } catch (error) {
      // Başlıklar zaten gönderildiyse JSON dönemeyiz; logla ve bağlantıyı kes
      if (res.headersSent) {
        logger.error({ err: error, importId: id }, 'Error occurred while streaming CSV export');
        res.destroy(error as Error);
        return;
      }
      next(error);
    }
  };

  getSummary = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = idParamSchema.parse(req.params);

      const ownerId = req.user?.ownerId;
      if (!ownerId) {
        throw new UnauthorizedError('Authenticated user context is missing');
      }

      const summary = await this.reportService.getSummary(id, ownerId);
      res.status(200).json(summary);
    } catch (error) {
      next(error);
    }
  };
}
