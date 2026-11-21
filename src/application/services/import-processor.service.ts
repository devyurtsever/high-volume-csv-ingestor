import fs from 'node:fs';
import { parse } from 'csv-parse';
import { UnrecoverableError } from 'bullmq';
import type { FileStoragePort } from '../ports/file-storage.port.js';
import type {
  BatchCustomer,
  BatchRowError,
  ImportRepositoryPort,
} from '../ports/import-repository.port.js';
import type { ImportQueueJobData } from '../ports/import-queue.port.js';
import { detectDelimiter } from '../../domain/import-job/header-parser.js';
import { normalizeHeader } from '../../domain/import-job/header-validator.js';
import { decideFinalStatus } from '../../domain/import-job/status-resolver.js';
import { validateRow, normalizeRow } from '../../domain/customer/validator.js';
import { DEFAULT_CUSTOMER_RULES } from '../../domain/customer/rules.js';
import { env } from '../../config/env.js';
import { logger } from '../../shared/logger.js';

export class ImportProcessorService {
  constructor(
    private readonly repository: ImportRepositoryPort,
    private readonly storage: FileStoragePort,
  ) {}

  async processImport(jobData: ImportQueueJobData): Promise<void> {
    const { importId, storedPath } = jobData;

    // 1. Atomik Claim: İşi sahiplenir
    const job = await this.repository.claimJob(importId);
    if (!job) {
      logger.info(
        { importId },
        'Import job already completed or currently claimed by another worker, skipping',
      );
      return;
    }

    // 2. Dosya diskte mevcut mu kontrolü yani Kalıcı hata kontrolü
    if (!fs.existsSync(storedPath)) {
      const errorMsg = `Stored file not found on disk: ${storedPath}`;
      logger.error({ importId, storedPath }, errorMsg);
      await this.repository.finishJob(importId, 'FAILED', undefined, errorMsg);
      throw new UnrecoverableError(errorMsg);
    }

    try {
      // 3. total_rows boşsa sayma geçişi
      if (job.total_rows === null) {
        try {
          // burada dosyanın ilerleme çubuğu için satır sayısını buluyoruz ve db'ye yazıyoruz
          const totalRows = await this.storage.countLines(storedPath);
          await this.repository.updateTotalRows(importId, totalRows);
        } catch (countErr) {
          logger.warn({ importId, err: countErr }, 'Could not pre-count lines, proceeding');
        }
      }

      // 4. Tek ayırıcı tespiti (Virgül veya Noktalı Virgül)
      const firstLine = await this.storage.readFirstLine(storedPath);
      if (!firstLine.trim()) {
        const errorMsg = 'Uploaded file is completely empty';
        await this.repository.finishJob(importId, 'FAILED', 0, errorMsg);
        if (env.DELETE_FILE_AFTER_IMPORT) {
          await this.storage.deleteFile(storedPath);
        }
        throw new UnrecoverableError(errorMsg);
      }
      //virgül mü yoksa noktalı virgül mü? yani excelden mi geldi yoksa standart mı onu anlıyoruz
      const delimiter = detectDelimiter(firstLine);

      // 5. Tarih bağlamı, TSI..
      const referenceToday = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Istanbul',
      }).format(new Date());
      const validationContext = { referenceToday };

      // 6. Checkpoint oku (Yeniden başlatmada kaldığı yerden devam)
      const lastCommittedRow = job.last_committed_row;

      // 7. Doğal Backpressure Stream (for await ile BATCH_SIZE kadar RAM kullanımı)
      const readStream = fs.createReadStream(storedPath);
      const parser = readStream.pipe(
        parse({
          delimiter,
          bom: true,
          columns: (headers: string[]) => headers.map(normalizeHeader),
          relax_column_count: true,
          skip_empty_lines: true,
          trim: true,
          from_line: 1,
        }),
      );

      // Okuma hatasını parser'a ilet
      readStream.on('error', (err) => parser.destroy(err));

      let currentRowNumber = 1; // 1. satır başlıktır
      const batchSize = env.BATCH_SIZE;
      let validCustomers: BatchCustomer[] = [];
      let validationErrors: BatchRowError[] = [];

      try {
        for await (const record of parser) {
          currentRowNumber++;

          // Checkpoint atlama: Önceden commit edilen satırları hızlıca atla
          if (currentRowNumber <= lastCommittedRow) {
            continue;
          }

          const rawRow = record as Record<string, string>;
          const issues = validateRow(rawRow, DEFAULT_CUSTOMER_RULES, validationContext);

          if (issues.length === 0) {
            const normalized = normalizeRow(rawRow);
            validCustomers.push({
              customer_id: normalized.customer_id,
              national_id: normalized.national_id,
              first_name: normalized.first_name,
              last_name: normalized.last_name,
              email: normalized.email,
              phone: normalized.phone,
              birth_date: normalized.birth_date,
              created_date: normalized.created_date,
              source_import_id: importId,
              source_row_number: currentRowNumber,
              raw: rawRow,
            });
          } else {
            validationErrors.push({
              import_id: importId,
              row_number: currentRowNumber,
              error_type: 'VALIDATION',
              error_codes: issues.map((i) => i.code),
              error_message: issues.map((i) => i.message).join('; '),
              raw_data: rawRow,
            });
          }

          // Batch dolunca veritabanına tek transaction ile yaz (Stream burada doğal olarak bekler)
          if (validCustomers.length + validationErrors.length >= batchSize) {
            await this.repository.commitBatch({
              importId,
              validCustomers,
              validationErrors,
              lastRowNumber: currentRowNumber,
            });

            // *** 2000 OLANA KADAR BU IKI DIZE DOLDURULUR ***
            validCustomers = []; // HATASIZ SATIRLAR*
            validationErrors = []; // HATALI SATIRLAR*
          }
        }

        // Kalan son batch'i yaz
        if (validCustomers.length > 0 || validationErrors.length > 0) {
          await this.repository.commitBatch({
            importId,
            validCustomers,
            validationErrors,
            lastRowNumber: currentRowNumber,
          });

          // TESLIM SONRASI RAM BOŞALSIN DİYE SIFIRLADIM
          validCustomers = [];
          validationErrors = [];
        }
      } finally {
        readStream.destroy();
        parser.destroy();
      }

      // 8. Bitiş: Sayaçları oku ve nihai duruma karar ver
      const finalJob = await this.repository.getJobById(importId);
      if (!finalJob) {
        throw new Error(`Import job not found upon completion: ${importId}`);
      }

      const totalProcessed = finalJob.processed_rows;
      const finalStatus = decideFinalStatus({
        total_rows: finalJob.total_rows ?? totalProcessed,
        processed_rows: totalProcessed,
        success_rows: finalJob.success_rows,
        failed_rows: finalJob.failed_rows,
        duplicate_rows: finalJob.duplicate_rows,
      });

      // total_rows değerini gerçek işlenen satır sayısı ile eşitle (Uzlaşma)
      await this.repository.finishJob(importId, finalStatus, totalProcessed);

      // KVKK uyumlu loglama: TCKN, e-posta veya satır verisi loglanmaz
      logger.info(
        {
          importId,
          status: finalStatus,
          processedRows: finalJob.processed_rows,
          successRows: finalJob.success_rows,
          failedRows: finalJob.failed_rows,
          duplicateRows: finalJob.duplicate_rows,
        },
        'Import job processing completed successfully',
      );

      // İsteğe bağlı geçici dosya temizliği
      if (env.DELETE_FILE_AFTER_IMPORT) {
        await this.storage.deleteFile(storedPath);
      }
    } catch (err: unknown) {
      // Hata türü ayrımı: Yapısal CSV parse hatası mı (kalıcı) yoksa DB/Ağ hatası mı (geçici)?
      const isCsvError =
        err instanceof Error &&
        'code' in err &&
        typeof (err as { code: unknown }).code === 'string' &&
        ((err as { code: string }).code.startsWith('CSV_') ||
          (err as { code: string }).code.includes('QUOTE'));

      if (isCsvError) {
        const errorMsg = err.message || 'Corrupted CSV syntax';
        logger.error({ importId, err }, 'Unrecoverable CSV syntax error');
        await this.repository.finishJob(importId, 'FAILED', undefined, errorMsg);
        if (env.DELETE_FILE_AFTER_IMPORT) {
          await this.storage.deleteFile(storedPath);
        }
        throw new UnrecoverableError(errorMsg);
      }

      // Geçici hatalarda hata fırlatılır; BullMQ exponential backoff ile tekrar dener
      logger.error({ importId, err }, 'Transient error encountered during import processing');
      throw err;
    }
  }
}
