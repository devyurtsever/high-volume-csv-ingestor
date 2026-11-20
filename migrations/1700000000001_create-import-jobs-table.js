/**
 * Migration 1: Create import_jobs table
 */
export const up = (pgm) => {
  pgm.sql(`
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    CREATE TABLE import_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_id VARCHAR(255) NOT NULL,
      original_filename VARCHAR(255) NOT NULL,
      stored_path VARCHAR(500) NOT NULL,
      file_size_bytes BIGINT NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
      total_rows INT NULL,
      processed_rows INT NOT NULL DEFAULT 0,
      success_rows INT NOT NULL DEFAULT 0,
      failed_rows INT NOT NULL DEFAULT 0,
      duplicate_rows INT NOT NULL DEFAULT 0,
      last_committed_row INT NOT NULL DEFAULT 0,
      attempts INT NOT NULL DEFAULT 0,
      error_message TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      started_at TIMESTAMPTZ NULL,
      finished_at TIMESTAMPTZ NULL,

      CONSTRAINT chk_import_jobs_status CHECK (
        status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'PARTIALLY_COMPLETED')
      ),
      CONSTRAINT chk_import_jobs_counters_sum CHECK (
        processed_rows = success_rows + failed_rows + duplicate_rows
      ),
      CONSTRAINT chk_import_jobs_processed_non_negative CHECK (processed_rows >= 0),
      CONSTRAINT chk_import_jobs_success_non_negative CHECK (success_rows >= 0),
      CONSTRAINT chk_import_jobs_failed_non_negative CHECK (failed_rows >= 0),
      CONSTRAINT chk_import_jobs_duplicate_non_negative CHECK (duplicate_rows >= 0),
      CONSTRAINT chk_import_jobs_last_committed_non_negative CHECK (last_committed_row >= 0)
    );

    CREATE INDEX idx_import_jobs_owner_created_at ON import_jobs (owner_id, created_at DESC);
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS import_jobs;
  `);
};
