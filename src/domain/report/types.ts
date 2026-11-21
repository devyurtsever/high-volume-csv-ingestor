import type { ImportErrorType, ImportJobStatus } from '../import-job/types.js';

export interface ErrorListItem {
  id: string;
  import_id: string;
  row_number: number;
  error_type: ImportErrorType;
  error_codes: string[];
  error_message: string;
  raw_data: Record<string, unknown>;
  created_at: Date;
}

export interface KeysetPaginationOptions {
  limit: number;
  afterRow?: number;
  errorType?: ImportErrorType;
}

export interface KeysetPaginatedResult<T> {
  items: T[];
  next_cursor: number | null;
  has_more: boolean;
}

export interface ErrorCodeDistribution {
  code: string;
  count: number;
}

export interface ImportSummaryResult {
  id: string;
  status: ImportJobStatus;
  total_rows: number | null;
  processed_rows: number;
  success_rows: number;
  failed_rows: number;
  duplicate_rows: number;
  success_rate: number;
  duration_seconds: number | null;
  rows_per_second: number | null;
  error_distribution: ErrorCodeDistribution[];
}
