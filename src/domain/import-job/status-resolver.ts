import type { ImportJobStatus } from './types.js';

export interface CountersInput {
  total_rows?: number | null;
  processed_rows?: number;
  success_rows: number;
  failed_rows: number;
  duplicate_rows: number;
}

/*
 * Aktarım tamamlandığında sayaçlara bakarak dosyanın nihai durumuna karar verir.
 *
 * Kurallar:
 * 1. Hiç başarılı satır yoksa (veya dosya boşsa) => FAILED (Başarısız)
 * 2. Hepsi başarıyla eklendiyse (sıfır hata, sıfır mükerrer) => COMPLETED (Tamamlandı)
 * 3. Bir kısmı eklendi ama hatalı/mükerrer de varsa => PARTIALLY_COMPLETED (Kısmen Tamamlandı)
 */
export function decideFinalStatus(counters: CountersInput): ImportJobStatus {
  const totalProcessed =
    counters.processed_rows ??
    counters.success_rows + counters.failed_rows + counters.duplicate_rows;

  if (counters.total_rows === 0 || totalProcessed === 0 || counters.success_rows === 0) {
    return 'FAILED';
  }

  if (counters.failed_rows === 0 && counters.duplicate_rows === 0) {
    return 'COMPLETED';
  }

  return 'PARTIALLY_COMPLETED';
}
