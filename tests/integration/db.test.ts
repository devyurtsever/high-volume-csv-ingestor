import { describe, it, expect, afterAll, beforeAll, beforeEach } from 'vitest';
import { pool, closePool } from '../../src/infrastructure/db/pool.js';
import { withTransaction } from '../../src/infrastructure/db/transaction.js';

describe('Database Schema & Constraints Integration Tests', () => {
  beforeAll(() => {
    // Safety guard: ensure tests do NOT truncate the development database
    const dbUrl = pool.options.connectionString ?? '';
    if (!dbUrl.includes('test')) {
      throw new Error(
        `Safety guard triggered: Integration tests must target a database containing 'test' in its name/URL. Current URL: ${dbUrl}`,
      );
    }
  });

  beforeEach(async () => {
    // Clean tables before each test
    await pool.query('TRUNCATE TABLE import_row_errors, customers, import_jobs CASCADE;');
  });

  afterAll(async () => {
    await closePool();
  });

  describe('withTransaction helper', () => {
    it('commits changes when the callback succeeds', async () => {
      const jobId = await withTransaction(pool, async (client) => {
        const res = await client.query(
          `INSERT INTO import_jobs (owner_id, original_filename, stored_path, file_size_bytes)
           VALUES ($1, $2, $3, $4)
           RETURNING id;`,
          ['owner-1', 'test.csv', '/tmp/test.csv', 1024],
        );
        return res.rows[0].id;
      });

      const check = await pool.query('SELECT id, owner_id FROM import_jobs WHERE id = $1', [jobId]);
      expect(check.rows.length).toBe(1);
      expect(check.rows[0].owner_id).toBe('owner-1');
    });

    it('rolls back changes and releases client when callback throws', async () => {
      let insertedId: string | null = null;

      await expect(
        withTransaction(pool, async (client) => {
          const res = await client.query(
            `INSERT INTO import_jobs (owner_id, original_filename, stored_path, file_size_bytes)
             VALUES ($1, $2, $3, $4)
             RETURNING id;`,
            ['owner-rollback', 'test.csv', '/tmp/test.csv', 2048],
          );
          insertedId = res.rows[0].id;
          throw new Error('Simulated transaction failure');
        }),
      ).rejects.toThrow('Simulated transaction failure');

      expect(insertedId).not.toBeNull();
      const check = await pool.query('SELECT id FROM import_jobs WHERE id = $1', [insertedId]);
      expect(check.rows.length).toBe(0);
    });
  });

  describe('import_jobs constraints', () => {
    it('enforces status check constraint', async () => {
      await expect(
        pool.query(
          `INSERT INTO import_jobs (owner_id, original_filename, stored_path, file_size_bytes, status)
           VALUES ($1, $2, $3, $4, $5);`,
          ['owner-1', 'test.csv', '/tmp/test.csv', 1024, 'INVALID_STATUS'],
        ),
      ).rejects.toThrow(/chk_import_jobs_status/);
    });

    it('enforces counter balance: processed_rows = success_rows + failed_rows + duplicate_rows', async () => {
      // Valid insert (10 = 5 + 3 + 2)
      const valid = await pool.query(
        `INSERT INTO import_jobs (
          owner_id, original_filename, stored_path, file_size_bytes,
          processed_rows, success_rows, failed_rows, duplicate_rows
        ) VALUES ($1, $2, $3, $4, 10, 5, 3, 2)
        RETURNING id;`,
        ['owner-1', 'test.csv', '/tmp/test.csv', 1024],
      );
      expect(valid.rows.length).toBe(1);

      // Invalid insert (10 != 5 + 3 + 1)
      await expect(
        pool.query(
          `INSERT INTO import_jobs (
            owner_id, original_filename, stored_path, file_size_bytes,
            processed_rows, success_rows, failed_rows, duplicate_rows
          ) VALUES ($1, $2, $3, $4, 10, 5, 3, 1);`,
          ['owner-1', 'test.csv', '/tmp/test.csv', 1024],
        ),
      ).rejects.toThrow(/chk_import_jobs_counters_sum/);
    });
  });

  describe('customers constraints', () => {
    let importJobId: string;

    beforeEach(async () => {
      const res = await pool.query(
        `INSERT INTO import_jobs (owner_id, original_filename, stored_path, file_size_bytes)
         VALUES ('owner-1', 'test.csv', '/tmp/test.csv', 100)
         RETURNING id;`,
      );
      importJobId = res.rows[0].id;
    });

    it('successfully inserts a valid customer', async () => {
      const res = await pool.query(
        `INSERT INTO customers (
          customer_id, national_id, first_name, last_name, email, phone,
          birth_date, created_date, source_import_id, source_row_number
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id;`,
        [
          'CUST-001',
          '12345678901',
          'Ali',
          'Yilmaz',
          'ali@example.com',
          '+905551234567',
          '1990-01-01',
          '2026-01-01',
          importJobId,
          2,
        ],
      );

      expect(res.rows.length).toBe(1);
      expect(typeof res.rows[0].id).toBe('string');
    });

    it('rejects duplicate customer_id with unique violation', async () => {
      await pool.query(
        `INSERT INTO customers (
          customer_id, national_id, first_name, last_name, email, phone,
          birth_date, created_date, source_import_id, source_row_number
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);`,
        [
          'CUST-DUP',
          '12345678901',
          'Ali',
          'Yilmaz',
          'ali@example.com',
          '+905551234567',
          '1990-01-01',
          '2026-01-01',
          importJobId,
          2,
        ],
      );

      // Same customer_id, different national_id
      await expect(
        pool.query(
          `INSERT INTO customers (
            customer_id, national_id, first_name, last_name, email, phone,
            birth_date, created_date, source_import_id, source_row_number
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);`,
          [
            'CUST-DUP',
            '98765432109',
            'Veli',
            'Demir',
            'veli@example.com',
            '+905559876543',
            '1992-05-15',
            '2026-01-02',
            importJobId,
            3,
          ],
        ),
      ).rejects.toThrow(/uq_customers_customer_id/);
    });

    it('rejects duplicate national_id with unique violation', async () => {
      await pool.query(
        `INSERT INTO customers (
          customer_id, national_id, first_name, last_name, email, phone,
          birth_date, created_date, source_import_id, source_row_number
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);`,
        [
          'CUST-001',
          '11111111110',
          'Ayse',
          'Kaya',
          'ayse@example.com',
          '+905551112233',
          '1985-03-20',
          '2026-01-01',
          importJobId,
          2,
        ],
      );

      // Different customer_id, same national_id
      await expect(
        pool.query(
          `INSERT INTO customers (
            customer_id, national_id, first_name, last_name, email, phone,
            birth_date, created_date, source_import_id, source_row_number
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);`,
          [
            'CUST-002',
            '11111111110',
            'Fatma',
            'Celik',
            'fatma@example.com',
            '+905553334455',
            '1988-07-12',
            '2026-01-02',
            importJobId,
            3,
          ],
        ),
      ).rejects.toThrow(/uq_customers_national_id/);
    });

    it('rejects national_id starting with 0 or having invalid length', async () => {
      // Starts with 0
      await expect(
        pool.query(
          `INSERT INTO customers (
            customer_id, national_id, first_name, last_name, email, phone,
            birth_date, created_date, source_import_id, source_row_number
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);`,
          [
            'CUST-003',
            '01234567890',
            'Mehmet',
            'Oz',
            'mehmet@example.com',
            '+905554445566',
            '1995-10-10',
            '2026-01-01',
            importJobId,
            2,
          ],
        ),
      ).rejects.toThrow(/chk_customers_national_id_format/);

      // Less than 11 digits
      await expect(
        pool.query(
          `INSERT INTO customers (
            customer_id, national_id, first_name, last_name, email, phone,
            birth_date, created_date, source_import_id, source_row_number
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);`,
          [
            'CUST-004',
            '1234567890',
            'Mehmet',
            'Oz',
            'mehmet@example.com',
            '+905554445566',
            '1995-10-10',
            '2026-01-01',
            importJobId,
            3,
          ],
        ),
      ).rejects.toThrow(/chk_customers_national_id_format/);
    });
  });

  describe('import_row_errors constraints', () => {
    let importJobId: string;

    beforeEach(async () => {
      const res = await pool.query(
        `INSERT INTO import_jobs (owner_id, original_filename, stored_path, file_size_bytes)
         VALUES ('owner-1', 'test.csv', '/tmp/test.csv', 100)
         RETURNING id;`,
      );
      importJobId = res.rows[0].id;
    });

    it('enforces composite unique constraint on (import_id, row_number)', async () => {
      await pool.query(
        `INSERT INTO import_row_errors (
          import_id, row_number, error_type, error_codes, error_message, raw_data
        ) VALUES ($1, $2, $3, $4, $5, $6);`,
        [
          importJobId,
          5,
          'VALIDATION',
          ['INVALID_EMAIL'],
          'Email format is invalid',
          JSON.stringify({ row: 5, email: 'bad-email' }),
        ],
      );

      // Attempt inserting second error for the same row in the same import
      await expect(
        pool.query(
          `INSERT INTO import_row_errors (
            import_id, row_number, error_type, error_codes, error_message, raw_data
          ) VALUES ($1, $2, $3, $4, $5, $6);`,
          [
            importJobId,
            5,
            'DUPLICATE',
            ['DUPLICATE_NATIONAL_ID'],
            'National ID already exists',
            JSON.stringify({ row: 5 }),
          ],
        ),
      ).rejects.toThrow(/uq_import_row_errors_import_row/);
    });

    it('cascades delete when the parent import_job is removed', async () => {
      await pool.query(
        `INSERT INTO import_row_errors (
          import_id, row_number, error_type, error_codes, error_message, raw_data
        ) VALUES ($1, $2, $3, $4, $5, $6);`,
        [
          importJobId,
          10,
          'VALIDATION',
          ['REQUIRED_FIELD_MISSING'],
          'First name missing',
          JSON.stringify({ row: 10 }),
        ],
      );

      const beforeDelete = await pool.query(
        'SELECT id FROM import_row_errors WHERE import_id = $1;',
        [importJobId],
      );
      expect(beforeDelete.rows.length).toBe(1);

      // Delete parent job
      await pool.query('DELETE FROM import_jobs WHERE id = $1;', [importJobId]);

      const afterDelete = await pool.query(
        'SELECT id FROM import_row_errors WHERE import_id = $1;',
        [importJobId],
      );
      expect(afterDelete.rows.length).toBe(0);
    });
  });
});
