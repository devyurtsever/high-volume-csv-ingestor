import type { ImportJob, ImportJobStatus } from '../../domain/import-job/types.js';

/*
 * Yeni bir import işi oluşturulurken veritabanına gönderilecek girdi parametreleri.
 */
export interface CreateImportJobInput {
  ownerId: string; // Dosyayı yükleyen kullanıcının kimliği (API keyden türetilir)
  originalFilename: string; // Orijinal dosya adı
  storedPath: string; // Sunucu diskinde kaydedildiği rastgele UUIDli yol
  fileSizeBytes: number; // Dosyanın bayt cinsinden boyutu
}

export interface PaginationOptions {
  page: number;
  limit: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/*
 * IMPORT REPOSITORY PORT (Veritabanı Arayüzü Sözleşmesi)
 * import_jobs tablosu üzerindeki CRUD işlemlerini soyutlar.
 * Servis katmanı PostgreSQL, raw SQL veya ORM detaylarını bilmez sadece bu metotları çağırır.
 * Gerçekte bu sözleşmeyi uygulayan adaptör: PgImportRepository (src/infrastructure/repositories/pg-import.repository.ts)
 */
export interface ImportRepositoryPort {
  /*
   * Yeni bir yükleme kaydını 'PENDING' durumunda veritabanına ekler.
   */
  create(input: CreateImportJobInput): Promise<ImportJob>;

  /*
   * Belirtilen ID ve ownerId'ye ait işi getirir (Başka kullanıcının işine erişimi engeller - IDOR koruması).
   */
  findById(id: string, ownerId: string): Promise<ImportJob | null>;

  /*
   * Sadece giriş yapan kullanıcıya ait geçmiş yüklemeleri sayfalanmış olarak listeler.
   */
  findMany(ownerId: string, pagination: PaginationOptions): Promise<PaginatedResult<ImportJob>>;

  /*
   * İşin durumunu (PENDING, PROCESSING, COMPLETED, FAILED) ve varsa hata mesajını günceller.
   */
  updateStatus(id: string, status: ImportJobStatus, errorMessage?: string | null): Promise<void>;
}
