import type { Pool } from 'pg';
import type { ImportJob, ImportJobStatus } from '../../domain/import-job/types.js';
import type {
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
}
