/**
 * Migration 2: Create customers table with unique constraints
 */
export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE customers (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      customer_id VARCHAR(100) NOT NULL,
      national_id CHAR(11) NOT NULL,
      first_name VARCHAR(100) NOT NULL,
      last_name VARCHAR(100) NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(50) NOT NULL,
      birth_date DATE NOT NULL,
      created_date DATE NOT NULL,
      source_import_id UUID NOT NULL,
      source_row_number INT NOT NULL,
      imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT uq_customers_customer_id UNIQUE (customer_id),
      CONSTRAINT uq_customers_national_id UNIQUE (national_id),
      CONSTRAINT chk_customers_national_id_format CHECK (national_id ~ '^[1-9][0-9]{10}$'),
      CONSTRAINT fk_customers_source_import FOREIGN KEY (source_import_id) REFERENCES import_jobs(id) ON DELETE RESTRICT
    );
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS customers;
  `);
};
