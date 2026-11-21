import type { ImportJob, ImportJobStatus } from '../../domain/import-job/types.js';
import type { ImportDetailResult } from '../../application/services/import.service.js';

export interface ImportJobResponse {
  id: string;
  original_filename: string;
  file_size_bytes: number;
  status: ImportJobStatus;
  total_rows: number | null;
  processed_rows: number;
  success_rows: number;
  failed_rows: number;
  duplicate_rows: number;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
}

export interface ImportJobDetailResponse extends ImportJobResponse {
  progress_percentage: number;
  last_committed_row: number;
  error_message: string | null;
}

export function toImportJobResponse(job: ImportJob): ImportJobResponse {
  return {
    id: job.id,
    original_filename: job.original_filename,
    file_size_bytes: Number(job.file_size_bytes),
    status: job.status,
    total_rows: job.total_rows,
    processed_rows: job.processed_rows,
    success_rows: job.success_rows,
    failed_rows: job.failed_rows,
    duplicate_rows: job.duplicate_rows,
    created_at: job.created_at,
    started_at: job.started_at,
    finished_at: job.finished_at,
  };
}

export function toImportJobDetailResponse(job: ImportDetailResult): ImportJobDetailResponse {
  return {
    ...toImportJobResponse(job),
    progress_percentage: job.progress_percentage,
    last_committed_row: job.last_committed_row,
    error_message: job.error_message,
  };
}
