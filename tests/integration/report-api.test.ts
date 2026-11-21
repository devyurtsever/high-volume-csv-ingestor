import crypto from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/api/app.js';
import { env } from '../../src/config/env.js';
import { pool } from '../../src/infrastructure/db/pool.js';

describe('Report API Integration Tests (Phase 5)', () => {
  const app = createApp();
  const validApiKey = env.API_KEY;
  const ownerId = crypto.createHash('sha256').update(validApiKey).digest('hex').slice(0, 16);

  beforeAll(() => {
    const dbUrl = pool.options.connectionString ?? '';
    if (!dbUrl.includes('test')) {
      throw new Error(`Integration tests must target a test database. Current URL: ${dbUrl}`);
    }
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE import_row_errors, customers, import_jobs CASCADE;');
  });

  afterAll(async () => {
    // Tests complete
  });

  // Helper to create an import job
  async function createTestJob(overrides: Record<string, unknown> = {}) {
    const defaultData = {
      owner_id: ownerId,
      original_filename: 'test.csv',
      stored_path: '/tmp/test.csv',
      file_size_bytes: 1000,
      status: 'COMPLETED',
      total_rows: 10,
      processed_rows: 10,
      success_rows: 4,
      failed_rows: 4,
      duplicate_rows: 2,
      started_at: new Date('2026-11-21T10:00:00Z'),
      finished_at: new Date('2026-11-21T10:00:05Z'), // 5 seconds
    };
    const merged = { ...defaultData, ...overrides };

    const res = await pool.query(
      `INSERT INTO import_jobs (
        owner_id, original_filename, stored_path, file_size_bytes, status,
        total_rows, processed_rows, success_rows, failed_rows, duplicate_rows,
        started_at, finished_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *;`,
      [
        merged.owner_id,
        merged.original_filename,
        merged.stored_path,
        merged.file_size_bytes,
        merged.status,
        merged.total_rows,
        merged.processed_rows,
        merged.success_rows,
        merged.failed_rows,
        merged.duplicate_rows,
        merged.started_at,
        merged.finished_at,
      ],
    );
    return res.rows[0];
  }

  // Helper to insert errors for a job
  async function insertTestErrors(importId: string, count: number) {
    for (let i = 1; i <= count; i++) {
      const errorType = i % 2 === 0 ? 'DUPLICATE' : 'VALIDATION';
      const errorCodes =
        errorType === 'DUPLICATE' ? ['DUPLICATE_RECORD'] : ['INVALID_NATIONAL_ID', 'INVALID_PHONE'];
      const rawData = {
        customer_id: `CUST-${i}`,
        first_name: `User, Name "Quote" ${i}`, // Includes comma and quotes for CSV escape test
        notes: `Line 1\nLine 2 for row ${i}`, // Includes newline
        formula: i === 1 ? '=SUM(1,2)' : undefined, // Includes formula
      };

      await pool.query(
        `INSERT INTO import_row_errors (
          import_id, row_number, error_type, error_codes, error_message, raw_data
        ) VALUES ($1, $2, $3, $4, $5, $6);`,
        [
          importId,
          i + 1, // Row numbers start at 2
          errorType,
          errorCodes,
          `Error message for row ${i + 1}`,
          JSON.stringify(rawData),
        ],
      );
    }
  }

  describe('GET /api/v1/imports/:id/errors (Keyset Pagination)', () => {
    it('should paginate correctly with LIMIT limit + 1 and exact multiple edge case', async () => {
      const job = await createTestJob();
      // Insert exactly 6 errors
      await insertTestErrors(job.id, 6);

      // Page 1: limit 3
      const resPage1 = await request(app)
        .get(`/api/v1/imports/${job.id}/errors?limit=3`)
        .set('X-API-Key', validApiKey);

      expect(resPage1.status).toBe(200);
      expect(resPage1.body.data).toHaveLength(3);
      expect(resPage1.body.pagination.has_more).toBe(true);
      expect(resPage1.body.pagination.next_cursor).toBe(4); // row numbers: 2, 3, 4 -> last is 4

      // Page 2: limit 3 with after_row = 4 (exact multiple of 6!)
      const resPage2 = await request(app)
        .get(`/api/v1/imports/${job.id}/errors?limit=3&after_row=4`)
        .set('X-API-Key', validApiKey);

      expect(resPage2.status).toBe(200);
      expect(resPage2.body.data).toHaveLength(3); // row numbers: 5, 6, 7
      expect(resPage2.body.pagination.has_more).toBe(false);
      expect(resPage2.body.pagination.next_cursor).toBeNull();
    });

    it('should filter errors by error_type', async () => {
      const job = await createTestJob();
      await insertTestErrors(job.id, 6); // 3 VALIDATION, 3 DUPLICATE

      const res = await request(app)
        .get(`/api/v1/imports/${job.id}/errors?error_type=VALIDATION`)
        .set('X-API-Key', validApiKey);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(3);
      for (const item of res.body.data) {
        expect(item.error_type).toBe('VALIDATION');
      }
    });

    it('should prevent IDOR and return 404 for an import owned by someone else', async () => {
      const otherJob = await createTestJob({ owner_id: 'other-owner-id' });

      const res = await request(app)
        .get(`/api/v1/imports/${otherJob.id}/errors`)
        .set('X-API-Key', validApiKey);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /api/v1/imports/:id/errors/export (Streaming CSV Export)', () => {
    it('should stream CSV with UTF-8 BOM, escaped quotes/commas, and formula sanitization across chunks', async () => {
      const job = await createTestJob();
      // Insert 12 errors
      await insertTestErrors(job.id, 12);

      const res = await request(app)
        .get(`/api/v1/imports/${job.id}/errors/export?chunk_size=5`)
        .set('X-API-Key', validApiKey);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain(`import-${job.id}-errors.csv`);

      const text = res.text;

      expect(text.startsWith('\uFEFF')).toBe(true);

      // 2. Verify Header row
      expect(text).toContain('Row Number,Error Type,Error Codes,Error Message,Raw Data');

      // 3. Verify Formula Injection sanitization ('=SUM(1,2) starts with single quote)
      expect(text).toContain("'=SUM(1,2)");

      // 4. Verify CSV escaping: quotes and commas in raw_data are escaped with double quotes
      expect(text).toContain('\\""Quote\\""');

      // 5. Verify all 12 rows are exported across chunks
      for (let i = 2; i <= 13; i++) {
        expect(text).toContain(`Error message for row ${i}`);
      }
    });

    it('should return 404 on export for non-existent job or another user job (IDOR)', async () => {
      const otherJob = await createTestJob({ owner_id: 'other-owner-id' });

      const res = await request(app)
        .get(`/api/v1/imports/${otherJob.id}/errors/export`)
        .set('X-API-Key', validApiKey);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/imports/:id/summary (Summary & Error Distribution)', () => {
    it('should return complete summary with success_rate, duration, rows_per_sec, and error_distribution', async () => {
      const job = await createTestJob({
        processed_rows: 100,
        success_rows: 80,
        failed_rows: 15,
        duplicate_rows: 5,
        started_at: new Date('2026-11-21T10:00:00Z'),
        finished_at: new Date('2026-11-21T10:00:04Z'), // 4 seconds
      });

      // Insert some errors to test distribution
      await insertTestErrors(job.id, 4);

      const res = await request(app)
        .get(`/api/v1/imports/${job.id}/summary`)
        .set('X-API-Key', validApiKey);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(job.id);
      expect(res.body.status).toBe('COMPLETED');
      expect(res.body.total_rows).toBe(10);
      expect(res.body.processed_rows).toBe(100);
      expect(res.body.success_rows).toBe(80);
      expect(res.body.failed_rows).toBe(15);
      expect(res.body.duplicate_rows).toBe(5);
      expect(res.body.success_rate).toBe(80); // (80 / 100) * 100
      expect(res.body.duration_seconds).toBe(4);
      expect(res.body.rows_per_second).toBe(25); // 100 / 4

      // Error distribution (unnest)
      expect(Array.isArray(res.body.error_distribution)).toBe(true);
      expect(res.body.error_distribution.length).toBeGreaterThan(0);
      const codes = res.body.error_distribution.map((d: { code: string }) => d.code);
      expect(codes).toContain('DUPLICATE_RECORD');
      expect(codes).toContain('INVALID_NATIONAL_ID');
    });

    it('should return null for duration and rows_per_second when job is PENDING', async () => {
      const pendingJob = await createTestJob({
        status: 'PENDING',
        processed_rows: 0,
        success_rows: 0,
        failed_rows: 0,
        duplicate_rows: 0,
        started_at: null,
        finished_at: null,
      });

      const res = await request(app)
        .get(`/api/v1/imports/${pendingJob.id}/summary`)
        .set('X-API-Key', validApiKey);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('PENDING');
      expect(res.body.duration_seconds).toBeNull();
      expect(res.body.rows_per_second).toBeNull();
      expect(res.body.success_rate).toBe(0);
      expect(res.body.error_distribution).toEqual([]);
    });

    it('should return null for rows_per_second when duration is 0 seconds (zero division guard)', async () => {
      const instantJob = await createTestJob({
        processed_rows: 10,
        success_rows: 10,
        failed_rows: 0,
        duplicate_rows: 0,
        started_at: new Date('2026-11-21T10:00:00.000Z'),
        finished_at: new Date('2026-11-21T10:00:00.000Z'), // 0 ms
      });

      const res = await request(app)
        .get(`/api/v1/imports/${instantJob.id}/summary`)
        .set('X-API-Key', validApiKey);

      expect(res.status).toBe(200);
      expect(res.body.duration_seconds).toBe(0);
      expect(res.body.rows_per_second).toBeNull();
    });

    it('should return 404 for another user import summary (IDOR)', async () => {
      const otherJob = await createTestJob({ owner_id: 'other-user' });

      const res = await request(app)
        .get(`/api/v1/imports/${otherJob.id}/summary`)
        .set('X-API-Key', validApiKey);

      expect(res.status).toBe(404);
    });
  });
});
