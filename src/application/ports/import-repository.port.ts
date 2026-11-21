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

export interface BatchCustomer {
  customer_id: string;
  national_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  birth_date: string;
  created_date: string;
  source_import_id: string;
  source_row_number: number;
  raw: Record<string, unknown>;
}

export interface BatchRowError {
  import_id: string;
  row_number: number;
  error_type: 'VALIDATION' | 'DUPLICATE';
  error_codes: string[];
  error_message: string;
  raw_data: Record<string, unknown>;
}

export interface CommitBatchInput {
  importId: string;
  validCustomers: BatchCustomer[];
  validationErrors: BatchRowError[];
  lastRowNumber: number;
}

export interface CommitBatchResult {
  insertedCount: number;
  duplicateCount: number;
  failedCount: number;
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
   * Kullanıcı kısıtı olmaksızın id'ye göre işi getirir (Worker arka plan işlemi için kullanılır).
   */
  getJobById(id: string): Promise<ImportJob | null>;

  /*
   * Sadece giriş yapan kullanıcıya ait geçmiş yüklemeleri sayfalanmış olarak listeler.
   */
  findMany(ownerId: string, pagination: PaginationOptions): Promise<PaginatedResult<ImportJob>>;

  /*
   * İşin durumunu (PENDING, PROCESSING, COMPLETED, FAILED) ve varsa hata mesajını günceller.
   */
  updateStatus(id: string, status: ImportJobStatus, errorMessage?: string | null): Promise<void>;

  /*
   * Worker süreci için işi atomik olarak sahiplenir (Claim).
   * Durumu 'PROCESSING' yapar, attempts sayısını artırır.
   * İş zaten tamamlanmışsa veya iptal edilmişse null döner (idempotency).
   */
  claimJob(id: string): Promise<ImportJob | null>;

  /*
   * Dosya satır sayımı tamamlandığında toplam veri satırını günceller.
   */
  updateTotalRows(id: string, totalRows: number): Promise<void>;

  /*
   * Tek transaction içinde müşterileri UNNEST ile toplu ekler, çakışanları mükerrer olarak tespit eder,
   * hataları import_row_errors tablosuna ekler ve sayaçları checkpoint ile birlikte günceller.
   * Deadlock (40P01) durumunda otomatik retry yapar.
   */
  commitBatch(input: CommitBatchInput): Promise<CommitBatchResult>;

  /*
   * İçe aktarım tamamlandığında nihai durumu, varsa toplam satır uzlaşmasını ve hata mesajını günceller.
   */
  finishJob(
    id: string,
    status: ImportJobStatus,
    totalRows?: number,
    errorMessage?: string | null,
  ): Promise<void>;
}
