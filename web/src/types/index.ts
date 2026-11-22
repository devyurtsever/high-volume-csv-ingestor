export type ImportStatus =
  'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'PARTIALLY_COMPLETED';

export interface ImportJob {
  id: string;
  original_filename: string;
  file_size_bytes: number;
  status: ImportStatus;
  total_rows: number | null;
  processed_rows: number;
  success_rows: number;
  failed_rows: number;
  duplicate_rows: number;
  last_committed_row: number;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface ErrorDistItem {
  code: string;
  count: number;
}

export interface ImportSummary {
  id: string;
  status: ImportStatus;
  total_rows: number;
  processed_rows: number;
  success_rows: number;
  failed_rows: number;
  duplicate_rows: number;
  success_rate: number;
  duration_seconds: number | null;
  rows_per_second: number | null;
  error_distribution: ErrorDistItem[];
}

export interface RowErrorItem {
  id: string;
  import_id: string;
  row_number: number;
  error_type: string;
  error_codes: string[];
  error_message: string;
  raw_data: Record<string, unknown> | null;
  created_at: string;
}

export interface ErrorsApiResponse {
  data: RowErrorItem[];
  pagination: {
    next_cursor: number | null;
    has_more: boolean;
    limit: number;
  };
}
