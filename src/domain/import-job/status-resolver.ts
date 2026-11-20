import type { ImportJobStatus } from '../../infrastructure/db/types.js';

export interface CountersInput {
  total_rows?: number | null;
  processed_rows?: number;
  success_rows: number;
  failed_rows: number;
  duplicate_rows: number;
}

/**
 * Pure function to decide final job status based on processing counters.
 *
 * Rules:
 * - If total_rows is 0, or processed_rows is 0, or success_rows is 0 => FAILED
 * - If success_rows > 0 and (failed_rows === 0 and duplicate_rows === 0) => COMPLETED
 * - If success_rows > 0 and (failed_rows > 0 or duplicate_rows > 0) => PARTIALLY_COMPLETED
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
