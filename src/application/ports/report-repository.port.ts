import type {
  ErrorCodeDistribution,
  ErrorListItem,
  KeysetPaginatedResult,
  KeysetPaginationOptions,
} from '../../domain/report/types.js';

/*
 REPORT REPOSITORY PORT 
 * Hata listeleme, dışa aktarma ve özet istatistiklerini soyutlar.
 */
export interface ReportRepositoryPort {
  /*
   * Keyset sayfalama ile hataları getirir.
   * has_more kontrolü için veritabanından LIMIT limit + 1 çeker.
   */
  findErrorsByKeyset(
    importId: string,
    options: KeysetPaginationOptions,
  ): Promise<KeysetPaginatedResult<ErrorListItem>>;

  /*
   * Streaming export için belirtilen satırdan sonraki hataları parça parça (chunk) çeker.
   */
  fetchErrorsChunk(importId: string, afterRow: number, chunkSize: number): Promise<ErrorListItem[]>;

  /*
   * unnest(error_codes) ve GROUP BY kullanarak hata kodlarının dağılımını çeker.
   */
  getErrorCodeDistribution(importId: string): Promise<ErrorCodeDistribution[]>;
}
