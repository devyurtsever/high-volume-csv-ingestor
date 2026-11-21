import type { Pool } from 'pg';
import type { ImportJob, ImportJobStatus } from '../../domain/import-job/types.js';
import type {
  BatchRowError,
  CommitBatchInput,
  CommitBatchResult,
  CreateImportJobInput,
  ImportRepositoryPort,
  PaginatedResult,
  PaginationOptions,
} from '../../application/ports/import-repository.port.js';

export class PgImportRepository implements ImportRepositoryPort {
  constructor(private readonly pool: Pool) {}

  async create(input: CreateImportJobInput): Promise<ImportJob> {
    /* Yeni import işini varsayılan olarak 'PENDING' durumunda PostgreSQL'e kaydeder */
    const query = `
      INSERT INTO import_jobs (
        owner_id,
        original_filename,
        stored_path,
        file_size_bytes,
        status
      ) VALUES ($1, $2, $3, $4, 'PENDING')
      RETURNING *;
    `;

    const values = [input.ownerId, input.originalFilename, input.storedPath, input.fileSizeBytes];

    const result = await this.pool.query<ImportJob>(query, values);
    return result.rows[0];
  }

  async findById(id: string, ownerId: string): Promise<ImportJob | null> {
    /* owner_id kontrolü ile kullanıcının yalnızca kendi işini görmesini sağlar (IDOR Koruması için eklenmeliydi) */
    // Kaç satır işlenmiş, dosya ne durumda diye kontrol için db'ye göz atıyoruz
    const query = `
      SELECT *
      FROM import_jobs
      WHERE id = $1 AND owner_id = $2;
    `;

    const result = await this.pool.query<ImportJob>(query, [id, ownerId]);
    return result.rows[0] ?? null;
  }

  /* İstenen sayfa ve limit değerine göre veritabanı atlama (offset) miktarını hesaplar */
  // !!!burada bugüne kadar yüklenilen tüm eski csv dosyalarının listesini sayfalı olarak getiriyoruz
  async findMany(
    ownerId: string,
    pagination: PaginationOptions,
  ): Promise<PaginatedResult<ImportJob>> {
    const offset = (pagination.page - 1) * pagination.limit;

    const countQuery = `
      SELECT COUNT(*)::int AS total
      FROM import_jobs
      WHERE owner_id = $1;
    `;

    const dataQuery = `
      SELECT *
      FROM import_jobs
      WHERE owner_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3;
    `;

    /* Toplam kayıt sayısını ve o sayfaya denk gelen verileri paralel olarak çeker */
    const [countRes, dataRes] = await Promise.all([
      this.pool.query<{ total: number }>(countQuery, [ownerId]),
      this.pool.query<ImportJob>(dataQuery, [ownerId, pagination.limit, offset]),
    ]);

    const total = countRes.rows[0]?.total ?? 0;
    const totalPages = Math.ceil(total / pagination.limit) || 1;

    return {
      items: dataRes.rows,
      total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages,
    };
  }

  async updateStatus(
    id: string,
    status: ImportJobStatus,
    errorMessage?: string | null,
  ): Promise<void> {
    /* Durumu günceller
    Takip fişinin durumunu PENDING'den PROCESSING'e, iş bitince de COMPLETED'a (veya hata varsa FAILED'a) çevirir. */
    const query = `
      UPDATE import_jobs
      SET status = $2::VARCHAR,
          error_message = COALESCE($3, error_message),
          finished_at = CASE WHEN $2::TEXT IN ('COMPLETED', 'FAILED', 'PARTIALLY_COMPLETED') THEN NOW() ELSE finished_at END
      WHERE id = $1;
    `;

    await this.pool.query(query, [id, status, errorMessage ?? null]);
  }

  async getJobById(id: string): Promise<ImportJob | null> {
    const query = `
      SELECT *
      FROM import_jobs
      WHERE id = $1;
    `;
    const result = await this.pool.query<ImportJob>(query, [id]);
    return result.rows[0] ?? null;
  }

  async claimJob(id: string): Promise<ImportJob | null> {
    const query = `
      UPDATE import_jobs
      SET status = 'PROCESSING',
          started_at = COALESCE(started_at, NOW()),
          attempts = attempts + 1
      WHERE id = $1 AND status IN ('PENDING', 'PROCESSING')
      RETURNING *;
    `;
    const result = await this.pool.query<ImportJob>(query, [id]);
    return result.rows[0] ?? null;
  }

  async updateTotalRows(id: string, totalRows: number): Promise<void> {
    const query = `
      UPDATE import_jobs
      SET total_rows = $2
      WHERE id = $1;
    `;
    await this.pool.query(query, [id, totalRows]);
  }

  async finishJob(
    id: string,
    status: ImportJobStatus,
    totalRows?: number,
    errorMessage?: string | null,
  ): Promise<void> {
    const query = `
      UPDATE import_jobs
      SET status = $2::VARCHAR,
          total_rows = COALESCE($3, total_rows),
          error_message = COALESCE($4, error_message),
          finished_at = NOW()
      WHERE id = $1;
    `;
    await this.pool.query(query, [id, status, totalRows ?? null, errorMessage ?? null]);
  }

  async commitBatch(input: CommitBatchInput): Promise<CommitBatchResult> {
    const client = await this.pool.connect();
    const MAX_DEADLOCK_RETRIES = 3;

    try {
      for (let attempt = 1; attempt <= MAX_DEADLOCK_RETRIES; attempt++) {
        try {
          await client.query('BEGIN');

          let insertedRowNumbers = new Set<number>();

          // 1. Geçerli müşteri satırlarını UNNEST ile toplu ekle
          if (input.validCustomers.length > 0) {
            const customerIds = input.validCustomers.map((c) => c.customer_id);
            const nationalIds = input.validCustomers.map((c) => c.national_id);
            const firstNames = input.validCustomers.map((c) => c.first_name);
            const lastNames = input.validCustomers.map((c) => c.last_name);
            const emails = input.validCustomers.map((c) => c.email);
            const phones = input.validCustomers.map((c) => c.phone);
            const birthDates = input.validCustomers.map((c) => c.birth_date);
            const createdDates = input.validCustomers.map((c) => c.created_date);
            const importIds = input.validCustomers.map((c) => c.source_import_id);
            const rowNumbers = input.validCustomers.map((c) => c.source_row_number);

            const insertCustomersQuery = `
              INSERT INTO customers (
                customer_id, national_id, first_name, last_name, email, phone,
                birth_date, created_date, source_import_id, source_row_number
              )
              SELECT * FROM unnest(
                $1::varchar[], $2::char(11)[], $3::varchar[], $4::varchar[],
                $5::varchar[], $6::varchar[], $7::date[], $8::date[],
                $9::uuid[], $10::int[]
              ) AS t(customer_id, national_id, first_name, last_name, email, phone, birth_date, created_date, source_import_id, source_row_number)
              ORDER BY national_id, source_row_number
              ON CONFLICT DO NOTHING
              RETURNING source_row_number;
            `;

            const insertRes = await client.query<{ source_row_number: number }>(
              insertCustomersQuery,
              [
                customerIds,
                nationalIds,
                firstNames,
                lastNames,
                emails,
                phones,
                birthDates,
                createdDates,
                importIds,
                rowNumbers,
              ],
            );

            insertedRowNumbers = new Set(insertRes.rows.map((r) => r.source_row_number));
          }

          // 2. Mükerrer satırları tespit et (valid olup veritabanına eklenemeyenler)
          const duplicateRows = input.validCustomers.filter(
            (c) => !insertedRowNumbers.has(c.source_row_number),
          );

          const duplicateErrors: BatchRowError[] = duplicateRows.map((c) => ({
            import_id: input.importId,
            row_number: c.source_row_number,
            error_type: 'DUPLICATE',
            error_codes: ['DUPLICATE_RECORD'],
            error_message: 'Customer with this customer_id or national_id already exists',
            raw_data: c.raw,
          }));

          // 3. Doğrulama ve mükerrer hatalarını string_to_array ile toplu ekle
          const allErrors = [...input.validationErrors, ...duplicateErrors];
          if (allErrors.length > 0) {
            const errImportIds = allErrors.map((e) => e.import_id);
            const errRowNumbers = allErrors.map((e) => e.row_number);
            const errTypes = allErrors.map((e) => e.error_type);
            const errCodesJoined = allErrors.map((e) => e.error_codes.join(','));
            const errMessages = allErrors.map((e) => e.error_message);
            const errRawDatas = allErrors.map((e) => JSON.stringify(e.raw_data));

            const insertErrorsQuery = `
              INSERT INTO import_row_errors (
                import_id, row_number, error_type, error_codes, error_message, raw_data
              )
              SELECT
                t.import_id,
                t.row_number,
                t.error_type,
                string_to_array(t.error_codes_str, ','),
                t.error_message,
                t.raw_data_str::jsonb
              FROM unnest(
                $1::uuid[],
                $2::int[],
                $3::varchar[],
                $4::text[],
                $5::text[],
                $6::text[]
              ) AS t(import_id, row_number, error_type, error_codes_str, error_message, raw_data_str)
              ON CONFLICT (import_id, row_number) DO NOTHING;
            `;

            await client.query(insertErrorsQuery, [
              errImportIds,
              errRowNumbers,
              errTypes,
              errCodesJoined,
              errMessages,
              errRawDatas,
            ]);
          }

          // 4. Sayaçları ve checkpoint'i (last_committed_row) atomik olarak güncelle
          const successCount = insertedRowNumbers.size;
          const duplicateCount = duplicateErrors.length;
          const failedCount = input.validationErrors.length;
          const processedCount = successCount + duplicateCount + failedCount;

          const updateCountersQuery = `
            UPDATE import_jobs
            SET processed_rows = processed_rows + $2,
                success_rows = success_rows + $3,
                failed_rows = failed_rows + $4,
                duplicate_rows = duplicate_rows + $5,
                last_committed_row = $6
            WHERE id = $1;
          `;

          await client.query(updateCountersQuery, [
            input.importId,
            processedCount,
            successCount,
            failedCount,
            duplicateCount,
            input.lastRowNumber,
          ]);

          await client.query('COMMIT');

          return {
            insertedCount: successCount,
            duplicateCount,
            failedCount,
          };
        } catch (err: unknown) {
          await client.query('ROLLBACK');
          const isDeadlock = (err as { code?: string })?.code === '40P01';
          if (isDeadlock && attempt < MAX_DEADLOCK_RETRIES) {
            const delay = 50 * attempt + Math.floor(Math.random() * 50);
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
          throw err;
        }
      }

      throw new Error('Batch commit failed after deadlock retries');
    } finally {
      client.release();
    }
  }
}
