import type { ImportJobStatus } from '../../domain/import-job/index.js';

export type { ImportJobStatus };

export interface ImportJob {
  id: string;
  owner_id: string;
  original_filename: string;
  stored_path: string;
  file_size_bytes: number | string;
  status: ImportJobStatus;
  total_rows: number | null;
  processed_rows: number;
  success_rows: number;
  failed_rows: number;
  duplicate_rows: number;
  last_committed_row: number;
  attempts: number;
  error_message: string | null;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
}

export interface Customer {
  id: string;
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
  imported_at: Date;
}

export type ImportErrorType = 'VALIDATION' | 'DUPLICATE';

export interface ImportRowError {
  id: string;
  import_id: string;
  row_number: number;
  error_type: ImportErrorType;
  error_codes: string[];
  error_message: string;
  raw_data: Record<string, unknown>;
  created_at: Date;
}
