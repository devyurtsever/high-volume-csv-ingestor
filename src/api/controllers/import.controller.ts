import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { ImportService } from '../../application/services/import.service.js';
import { BadRequestError, UnauthorizedError } from '../../shared/errors.js';
import { toImportJobDetailResponse, toImportJobResponse } from './import.mapper.js';

const idParamSchema = z.object({
  id: z.string().uuid({ message: 'Import ID must be a valid UUID' }),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export class ImportController {
  constructor(private readonly importService: ImportService) {}

  upload = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        throw new BadRequestError(
          'CSV file is required. Please provide a file in the form field "file".',
        );
      }

      const ownerId = req.user?.ownerId;
      if (!ownerId) {
        throw new UnauthorizedError('Authenticated user context is missing');
      }

      const baseUrl = `${req.protocol}://${req.get('host') ?? 'localhost'}`;

      const result = await this.importService.uploadImport(
        {
          path: req.file.path,
          originalname: req.file.originalname,
          size: req.file.size,
        },
        ownerId,
        baseUrl,
      );

      // Return 202 Accepted: request has been accepted for processing
      res.status(202).json({
        id: result.job.id,
        status: result.job.status,
        statusUrl: result.statusUrl,
        original_filename: result.job.original_filename,
        file_size_bytes: Number(result.job.file_size_bytes),
        created_at: result.job.created_at,
      });
    } catch (error) {
      next(error);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const ownerId = req.user?.ownerId;
      if (!ownerId) {
        throw new UnauthorizedError('Authenticated user context is missing');
      }

      const job = await this.importService.getImportById(id, ownerId);
      res.status(200).json(toImportJobDetailResponse(job));
    } catch (error) {
      next(error);
    }
  };

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = listQuerySchema.parse(req.query);
      const ownerId = req.user?.ownerId;
      if (!ownerId) {
        throw new UnauthorizedError('Authenticated user context is missing');
      }

      const result = await this.importService.listImports(ownerId, query);
      res.status(200).json({
        ...result,
        items: result.items.map(toImportJobResponse),
      });
    } catch (error) {
      next(error);
    }
  };
}
