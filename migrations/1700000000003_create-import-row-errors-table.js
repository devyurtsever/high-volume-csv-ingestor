/**
 * Migration 3: Create import_row_errors table
 */
export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE import_row_errors (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      import_id UUID NOT NULL,
      row_number INT NOT NULL,
      error_type VARCHAR(30) NOT NULL,
      error_codes TEXT[] NOT NULL,
      error_message TEXT NOT NULL,
      raw_data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT chk_import_row_errors_type CHECK (error_type IN ('VALIDATION', 'DUPLICATE')),
      CONSTRAINT fk_import_row_errors_import FOREIGN KEY (import_id) REFERENCES import_jobs(id) ON DELETE CASCADE,
      CONSTRAINT uq_import_row_errors_import_row UNIQUE (import_id, row_number)
    );
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS import_row_errors;
  `);
};
