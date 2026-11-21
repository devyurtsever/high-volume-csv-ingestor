import { stringify } from 'csv-stringify';
import type { ImportRepositoryPort } from '../ports/import-repository.port.js';
import type { ReportRepositoryPort } from '../ports/report-repository.port.js';
import type {
  ErrorListItem,
  ImportSummaryResult,
  KeysetPaginatedResult,
  KeysetPaginationOptions,
} from '../../domain/report/types.js';
import { sanitizeCsvFormula, sanitizeRecord } from '../../domain/report/formula-sanitizer.js';
import { NotFoundError } from '../../shared/errors.js';

export class ReportService {
  constructor(
    private readonly importRepository: ImportRepositoryPort,
    private readonly reportRepository: ReportRepositoryPort,
  ) {}

  // İŞ-KULLANICI EŞLEŞME KONTROLÜ
  async verifyOwnership(importId: string, ownerId: string): Promise<void> {
    const job = await this.importRepository.findById(importId, ownerId);
    if (!job) {
      throw new NotFoundError('Import job not found');
    }
  }

  async getErrors(
    importId: string,
    ownerId: string,
    options: KeysetPaginationOptions,
  ): Promise<KeysetPaginatedResult<ErrorListItem>> {
    // IDOR Koruması!! Keyset sayfalama ile kullanıcı yalnızca kendi işinin hatalarını görebilir
    const job = await this.importRepository.findById(importId, ownerId);
    if (!job) {
      throw new NotFoundError('Import job not found');
    }

    return this.reportRepository.findErrorsByKeyset(importId, options);
  }

  async *exportErrorsCsv(
    importId: string,
    ownerId: string,
    chunkSize = 5000,
  ): AsyncGenerator<string> {
    // IDOR Koruması
    const job = await this.importRepository.findById(importId, ownerId);
    if (!job) {
      throw new NotFoundError('Import job not found');
    }

    // 1. Excel için UTF-8 BOM (\uFEFF)
    yield '\uFEFF';

    // 2. CSV Başlık satırı
    const headerCsv = await new Promise<string>((resolve, reject) => {
      stringify(
        [['Row Number', 'Error Type', 'Error Codes', 'Error Message', 'Raw Data']],
        (err, output) => (err ? reject(err) : resolve(output)),
      );
    });
    yield headerCsv;

    // 3. Parça parça oku ve üret (AsyncGenerator - HTTP katmanına bağımsız)
    let afterRow = 0;
    while (true) {
      const chunk = await this.reportRepository.fetchErrorsChunk(importId, afterRow, chunkSize);
      if (chunk.length === 0) {
        break;
      }

      // Her metin hücresine önce sanitizeCsvFormula uygula, sonra stringify ile tırnakla
      const rows = chunk.map((item) => [
        sanitizeCsvFormula(String(item.row_number)),
        sanitizeCsvFormula(item.error_type),
        sanitizeCsvFormula(item.error_codes.join('; ')),
        sanitizeCsvFormula(item.error_message),
        sanitizeCsvFormula(JSON.stringify(sanitizeRecord(item.raw_data))),
      ]);

      const chunkCsv = await new Promise<string>((resolve, reject) => {
        stringify(rows, (err, output) => (err ? reject(err) : resolve(output)));
      });

      yield chunkCsv;

      afterRow = chunk[chunk.length - 1].row_number;
      if (chunk.length < chunkSize) {
        break;
      }
    }
  }

  async getSummary(importId: string, ownerId: string): Promise<ImportSummaryResult> {
    // IDOR Koruması
    const job = await this.importRepository.findById(importId, ownerId);
    if (!job) {
      throw new NotFoundError('Import job not found');
    }

    const distribution = await this.reportRepository.getErrorCodeDistribution(importId);

    const processedRows = job.processed_rows;
    const successRows = job.success_rows;

    const successRate =
      processedRows > 0 ? Number(((successRows / processedRows) * 100).toFixed(2)) : 0;

    let durationSeconds: number | null = null;
    let rowsPerSecond: number | null = null;

    if (job.started_at && job.finished_at) {
      const durationMs = new Date(job.finished_at).getTime() - new Date(job.started_at).getTime();
      const sec = Math.max(0, durationMs / 1000);
      durationSeconds = Number(sec.toFixed(2));

      if (sec > 0 && processedRows > 0) {
        rowsPerSecond = Number((processedRows / sec).toFixed(2));
      }
    }

    return {
      id: job.id,
      status: job.status,
      total_rows: job.total_rows,
      processed_rows: processedRows,
      success_rows: successRows,
      failed_rows: job.failed_rows,
      duplicate_rows: job.duplicate_rows,
      success_rate: successRate,
      duration_seconds: durationSeconds,
      rows_per_second: rowsPerSecond,
      error_distribution: distribution,
    };
  }
}
