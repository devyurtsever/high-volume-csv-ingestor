import type { ImportJob } from '../../domain/import-job/types.js';
import type {
  ImportRepositoryPort,
  PaginatedResult,
  PaginationOptions,
} from '../ports/import-repository.port.js';
import type { ImportQueuePort } from '../ports/import-queue.port.js';
import type { FileStoragePort } from '../ports/file-storage.port.js';
import { parseHeaderLine } from '../../domain/import-job/header-parser.js';
import { validateHeaders } from '../../domain/import-job/header-validator.js';
import {
  BadRequestError,
  NotFoundError,
  ServiceUnavailableError,
  UnprocessableEntityError,
} from '../../shared/errors.js';
import { logger } from '../../shared/logger.js';

export interface UploadImportResult {
  job: ImportJob;
  statusUrl: string;
}

export interface ImportDetailResult extends ImportJob {
  progress_percentage: number;
}

export class ImportService {
  constructor(
    private readonly repository: ImportRepositoryPort,
    private readonly queue: ImportQueuePort,
    private readonly storage: FileStoragePort,
  ) {}

  async uploadImport(
    file: Express.Multer.File | undefined,
    ownerId: string,
    baseUrl: string,
  ): Promise<UploadImportResult> {
    if (!file) {
      throw new BadRequestError('No CSV file uploaded');
    }

    try {
      // 1. RAM'i şişirmemek için dosyanın sadece en üstteki başlık satırını okur
      let firstLine: string;
      try {
        firstLine = await this.storage.readFirstLine(file.path);
      } catch (err) {
        logger.error({ err, filePath: file.path }, 'Could not read uploaded file');
        throw new BadRequestError('Could not read uploaded file');
      }

      /* Dosya tamamen boşsa hata verir ve işlemi keser */
      if (!firstLine.trim()) {
        throw new UnprocessableEntityError('Uploaded file is completely empty', {
          missingHeaders: [
            'customer_id',
            'first_name',
            'last_name',
            'national_id',
            'email',
            'phone',
            'birth_date',
            'created_date',
          ],
        });
      }

      /* 2. Başlık satırını ayıklar (virgül, noktalı virgül ve BOM temizliği) */
      let rawHeaders: string[];
      try {
        rawHeaders = parseHeaderLine(firstLine);
      } catch (parseError) {
        logger.warn({ err: parseError, filePath: file.path }, 'Could not parse CSV header row');
        throw new UnprocessableEntityError('Could not parse CSV header row');
      }

      /* 3. Zorunlu 8 kolon tam mı diye Domain kurallarıyla kontrol eder */
      const headerResult = validateHeaders(rawHeaders);
      if (!headerResult.isValid) {
        throw new UnprocessableEntityError('Invalid or missing CSV column headers', {
          missingHeaders: headerResult.missingHeaders,
          duplicateHeaders: headerResult.duplicateHeaders,
          unexpectedHeaders: headerResult.unexpectedHeaders,
        });
      }

      /* 4. Veritabanında 'PENDING' durumunda yeni bir iş kaydı açar */
      let job: ImportJob;
      try {
        job = await this.repository.create({
          ownerId,
          originalFilename: file.originalname,
          storedPath: file.path,
          fileSizeBytes: file.size,
        });
      } catch (dbError) {
        logger.error({ err: dbError, filePath: file.path }, 'Failed to create import_jobs record');
        throw dbError;
      }

      /* 5. İşi BullMQ kuyruğuna atar kuyruk çökerse DB kaydını FAILED yapar (Dual-Write koruması) */
      try {
        await this.queue.addJob({
          importId: job.id,
          storedPath: job.stored_path,
          originalFilename: job.original_filename,
        });
      } catch (queueError) {
        logger.error(
          { err: queueError, importId: job.id },
          'Dual-write failure: Failed to enqueue job to BullMQ after DB record creation',
        );

        await this.repository.updateStatus(
          job.id,
          'FAILED',
          'Queue service unavailable: job could not be queued for background processing',
        );

        throw new ServiceUnavailableError(
          'Queue service is temporarily unavailable. Job creation failed and has been canceled.',
        );
      }

      const statusUrl = `${baseUrl}/api/v1/imports/${job.id}`;

      return {
        job,
        statusUrl,
      };
    } catch (error) {
      /* Herhangi bir hata durumunda yüklenen geçici dosyayı diskten anında siler */
      await this.storage.deleteFile(file.path);
      throw error;
    }
  }

  async getImportById(id: string, ownerId: string): Promise<ImportDetailResult> {
    /* İşi veritabanından sorgular başkasına aitse 404 döner (IDOR Koruması) */
    const job = await this.repository.findById(id, ownerId);
    if (!job) {
      throw new NotFoundError('Import job not found');
    }

    /* İlerleme yüzdesini hesaplar (İşlenen satır / Toplam satır * 100) */
    const total = job.total_rows;
    let progressPercentage = 0;

    if (total && total > 0) {
      progressPercentage = Math.min(100, Math.round((job.processed_rows / total) * 100));
    } else if (job.status === 'COMPLETED' || job.status === 'PARTIALLY_COMPLETED') {
      progressPercentage = 100;
    }

    return {
      ...job,
      progress_percentage: progressPercentage,
    };
  }

  async listImports(
    ownerId: string,
    pagination: PaginationOptions,
  ): Promise<PaginatedResult<ImportJob>> {
    /* Giriş yapan kullanıcının geçmiş yüklemelerini sayfalanmış olarak listeler */
    return this.repository.findMany(ownerId, pagination);
  }
}
