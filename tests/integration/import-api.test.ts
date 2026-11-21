import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/api/app.js';
import { container } from '../../src/api/container.js';
import { env } from '../../src/config/env.js';
import { pool } from '../../src/infrastructure/db/pool.js';

describe('Import API Integration Tests (Phase 3)', () => {
  const app = createApp();
  const ownerId = crypto.createHash('sha256').update(env.API_KEY).digest('hex').slice(0, 16);

  const VALID_CSV_COMMA = [
    'customer_id,first_name,last_name,national_id,email,phone,birth_date,created_date',
    'CUST-001,Ahmet,Yılmaz,12345678901,ahmet@example.com,+905551234567,1990-01-01,2023-01-01',
    'CUST-002,Ayşe,Kaya,98765432109,ayse@example.com,05559876543,1995-05-15,2023-02-01',
  ].join('\n');

  const VALID_CSV_SEMICOLON_BOM =
    '\uFEFF' +
    [
      'customer_id;first_name;last_name;national_id;email;phone;birth_date;created_date',
      'CUST-003;Mehmet;Demir;12345678901;mehmet@example.com;+905551112233;1988-12-10;2023-03-01',
    ].join('\n');

  const INVALID_HEADERS_CSV = [
    'customer_id,first_name,last_name,email,phone,birth_date,created_date', // missing national_id
    'CUST-001,Ahmet,Yılmaz,ahmet@example.com,+905551234567,1990-01-01,2023-01-01',
  ].join('\n');

  // > 1024 bytes (env.MAX_FILE_SIZE_BYTES is set to 1024 in test environment)
  const OVERSIZED_CSV =
    'customer_id,first_name,last_name,national_id,email,phone,birth_date,created_date\n' +
    'CUST-999,Mehmet,Demir,12345678901,mehmet@example.com,+905551112233,1988-12-10,2023-03-01\n'.repeat(
      20,
    );

  beforeAll(() => {
    // Safety guard: ensure tests do NOT target development or production database
    const dbUrl = pool.options.connectionString ?? '';
    if (!dbUrl.includes('test')) {
      throw new Error(
        `Safety guard triggered: Integration tests must target a database containing 'test' in its name/URL. Current URL: ${dbUrl}`,
      );
    }
  });

  beforeEach(async () => {
    // Clean all tables before each test
    await pool.query('TRUNCATE TABLE import_row_errors, customers, import_jobs CASCADE;');

    // Clean up uploaded test files (ignoring .gitkeep)
    const files = await fs.promises.readdir(env.UPLOAD_DIR);
    for (const file of files) {
      if (file !== '.gitkeep') {
        await fs.promises.unlink(path.join(env.UPLOAD_DIR, file));
      }
    }
  });

  afterEach(async () => {
    // Clear BullMQ queue after each test to prevent test cross-contamination
    await container.importQueue.clearQueue();
  });

  afterAll(async () => {
    await container.cleanup();
  });

  // =========================================================================
  // 1. Authentication Middleware Tests
  // =========================================================================
  describe('Authentication (X-API-Key)', () => {
    it('rejects POST /api/v1/imports without X-API-Key header (401)', async () => {
      const res = await request(app)
        .post('/api/v1/imports')
        .attach('file', Buffer.from(VALID_CSV_COMMA), 'customers.csv');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.body.error.message).toContain('API key');
    });

    it('rejects POST /api/v1/imports with invalid X-API-Key header (401)', async () => {
      const res = await request(app)
        .post('/api/v1/imports')
        .set('X-API-Key', 'wrong-invalid-key')
        .attach('file', Buffer.from(VALID_CSV_COMMA), 'customers.csv');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects GET /api/v1/imports without X-API-Key header (401)', async () => {
      const res = await request(app).get('/api/v1/imports');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects GET /api/v1/imports/:id without X-API-Key header (401)', async () => {
      const res = await request(app).get('/api/v1/imports/00000000-0000-0000-0000-000000000000');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  // =========================================================================
  // 2. CSV Upload Endpoint (POST /api/v1/imports)
  // =========================================================================
  describe('POST /api/v1/imports (CSV Upload)', () => {
    it('accepts valid comma-separated CSV and returns 202 Accepted with statusUrl and BullMQ job', async () => {
      const res = await request(app)
        .post('/api/v1/imports')
        .set('X-API-Key', env.API_KEY)
        .attach('file', Buffer.from(VALID_CSV_COMMA), 'valid_customers.csv');

      expect(res.status).toBe(202);
      expect(res.body).toHaveProperty('id');
      expect(res.body.status).toBe('PENDING');
      expect(res.body.original_filename).toBe('valid_customers.csv');
      expect(res.body.file_size_bytes).toBe(Buffer.byteLength(VALID_CSV_COMMA));
      expect(res.body.statusUrl).toContain(`/api/v1/imports/${res.body.id}`);

      // Verify record is created in the database with derived ownerId
      const dbCheck = await pool.query(
        'SELECT id, status, original_filename, stored_path, owner_id FROM import_jobs WHERE id = $1',
        [res.body.id],
      );
      expect(dbCheck.rows.length).toBe(1);
      expect(dbCheck.rows[0].status).toBe('PENDING');
      expect(dbCheck.rows[0].owner_id).toBe(ownerId);

      // Verify job was enqueued in BullMQ (Item 8)
      const queuedJob = await container.importQueue.getJob(res.body.id);
      expect(queuedJob).toBeDefined();
      expect(queuedJob?.id).toBe(res.body.id);
      expect(queuedJob?.data.importId).toBe(res.body.id);
      expect(queuedJob?.data.originalFilename).toBe('valid_customers.csv');

      // Verify file was written to disk
      expect(fs.existsSync(dbCheck.rows[0].stored_path)).toBe(true);

      // Clean up file from test disk
      await fs.promises.unlink(dbCheck.rows[0].stored_path);
    });

    it('accepts valid semicolon-separated CSV with UTF-8 BOM (202 Accepted)', async () => {
      const res = await request(app)
        .post('/api/v1/imports')
        .set('X-API-Key', env.API_KEY)
        .attach('file', Buffer.from(VALID_CSV_SEMICOLON_BOM), 'semicolon_bom.csv');

      expect(res.status).toBe(202);
      expect(res.body.status).toBe('PENDING');

      // Clean up stored file
      const dbCheck = await pool.query('SELECT stored_path FROM import_jobs WHERE id = $1', [
        res.body.id,
      ]);
      await fs.promises.unlink(dbCheck.rows[0].stored_path);
    });

    it('rejects request with missing file payload (400 Bad Request)', async () => {
      const res = await request(app).post('/api/v1/imports').set('X-API-Key', env.API_KEY);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
      expect(res.body.error.message).toContain('CSV file is required');
    });

    it('rejects file with non-csv extension (400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/v1/imports')
        .set('X-API-Key', env.API_KEY)
        .attach('file', Buffer.from('some text'), 'customers.txt');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
      expect(res.body.error.message).toContain('.csv extension');
    });

    it('rejects completely empty CSV file and cleans up file (422 Unprocessable Entity)', async () => {
      const res = await request(app)
        .post('/api/v1/imports')
        .set('X-API-Key', env.API_KEY)
        .attach('file', Buffer.from('   \n\n   '), 'empty.csv');

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('UNPROCESSABLE_ENTITY');
      expect(res.body.error.message).toContain('completely empty');

      // Verify no job was persisted
      const dbCheck = await pool.query('SELECT COUNT(*)::int AS count FROM import_jobs');
      expect(dbCheck.rows[0].count).toBe(0);

      // Verify no file leaked to disk
      const csvFiles = (await fs.promises.readdir(env.UPLOAD_DIR)).filter((f) =>
        f.endsWith('.csv'),
      );
      expect(csvFiles.length).toBe(0);
    });

    it('rejects CSV with missing required headers and cleans up file (422 Unprocessable Entity)', async () => {
      const res = await request(app)
        .post('/api/v1/imports')
        .set('X-API-Key', env.API_KEY)
        .attach('file', Buffer.from(INVALID_HEADERS_CSV), 'bad_headers.csv');

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('UNPROCESSABLE_ENTITY');
      expect(res.body.error.details.missingHeaders).toContain('national_id');

      // Verify no DB record was left
      const dbCheck = await pool.query('SELECT COUNT(*)::int AS count FROM import_jobs');
      expect(dbCheck.rows[0].count).toBe(0);

      // Verify upload directory has no dangling file for bad_headers.csv
      const csvFiles = (await fs.promises.readdir(env.UPLOAD_DIR)).filter((f) =>
        f.endsWith('.csv'),
      );
      expect(csvFiles.length).toBe(0);
    });

    it('handles dual-write failure: marks DB job FAILED, deletes file, and returns 503 Service Unavailable', async () => {
      const queueSpy = vi
        .spyOn(container.importQueue, 'addJob')
        .mockRejectedValueOnce(new Error('Redis connection lost during enqueue'));

      const res = await request(app)
        .post('/api/v1/imports')
        .set('X-API-Key', env.API_KEY)
        .attach('file', Buffer.from(VALID_CSV_COMMA), 'fail_job.csv');

      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(res.body.error.message).toContain('Queue service is temporarily unavailable');

      // Verify DB record status was updated to FAILED
      const dbCheck = await pool.query(
        "SELECT id, status, error_message, stored_path FROM import_jobs WHERE original_filename = 'fail_job.csv'",
      );
      expect(dbCheck.rows.length).toBe(1);
      expect(dbCheck.rows[0].status).toBe('FAILED');
      expect(dbCheck.rows[0].error_message).toContain('Queue service unavailable');

      // Verify file was cleaned up from disk
      expect(fs.existsSync(dbCheck.rows[0].stored_path)).toBe(false);

      queueSpy.mockRestore();
    });
  });

  // =========================================================================
  // 3. Real File Size Limit (413 Payload Too Large - Item 7)
  // =========================================================================
  describe('File Size Limit (413 Payload Too Large)', () => {
    it('returns 413 Payload Too Large when real file exceeds MAX_FILE_SIZE_BYTES and deletes file', async () => {
      const res = await request(app)
        .post('/api/v1/imports')
        .set('X-API-Key', env.API_KEY)
        .attach('file', Buffer.from(OVERSIZED_CSV), 'oversized.csv');

      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
      expect(res.body.error.message).toContain('exceeds maximum allowed limit');

      // Verify no file remains on disk
      const csvFiles = (await fs.promises.readdir(env.UPLOAD_DIR)).filter((f) =>
        f.endsWith('.csv'),
      );
      expect(csvFiles.length).toBe(0);
    });
  });

  // =========================================================================
  // 4. Malformed JSON Body Handling (Item 6)
  // =========================================================================
  describe('Malformed JSON body', () => {
    it('returns 400 Bad Request when request body has malformed JSON', async () => {
      const res = await request(app)
        .post('/api/v1/imports')
        .set('X-API-Key', env.API_KEY)
        .set('Content-Type', 'application/json')
        .send('{"invalidJson": ');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
      expect(res.body.error.message).toContain('Malformed JSON payload');
    });
  });

  // =========================================================================
  // 5. Import Detail Endpoint (GET /api/v1/imports/:id)
  // =========================================================================
  describe('GET /api/v1/imports/:id (Import Status & Detail)', () => {
    it('rejects invalid UUID format with 400 Validation Error', async () => {
      const res = await request(app)
        .get('/api/v1/imports/not-a-valid-uuid')
        .set('X-API-Key', env.API_KEY);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.fieldErrors).toHaveProperty('id');
    });

    it('returns 404 Not Found for non-existent import ID', async () => {
      const res = await request(app)
        .get('/api/v1/imports/a0000000-0000-0000-0000-000000000000')
        .set('X-API-Key', env.API_KEY);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('IDOR Protection: returns 404 Not Found (not 403) when accessing another user job', async () => {
      // Insert a job owned by a different user
      const insertRes = await pool.query(
        `INSERT INTO import_jobs (owner_id, original_filename, stored_path, file_size_bytes, status)
         VALUES ('other-user-999', 'confidential.csv', '/tmp/confidential.csv', 1024, 'PENDING')
         RETURNING id;`,
      );
      const foreignJobId = insertRes.rows[0].id;

      // Authenticated client requests the foreign job
      const res = await request(app)
        .get(`/api/v1/imports/${foreignJobId}`)
        .set('X-API-Key', env.API_KEY);

      // Must be 404 to avoid leaking existence of foreign IDs (preventing ID enumeration)
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 200 with sanitized job details (no stored_path, owner_id, attempts)', async () => {
      const insertRes = await pool.query(
        `INSERT INTO import_jobs (
           owner_id, original_filename, stored_path, file_size_bytes,
           status, total_rows, processed_rows, success_rows, failed_rows, duplicate_rows
         ) VALUES ($1, $2, $3, $4, 'PROCESSING', 100, 45, 40, 3, 2)
         RETURNING id;`,
        [ownerId, 'test_progress.csv', '/tmp/test_progress.csv', 2048],
      );
      const jobId = insertRes.rows[0].id;

      const res = await request(app).get(`/api/v1/imports/${jobId}`).set('X-API-Key', env.API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(jobId);
      expect(res.body.status).toBe('PROCESSING');
      expect(res.body.total_rows).toBe(100);
      expect(res.body.processed_rows).toBe(45);
      expect(res.body.success_rows).toBe(40);
      expect(res.body.failed_rows).toBe(3);
      expect(res.body.duplicate_rows).toBe(2);
      expect(res.body.progress_percentage).toBe(45);
      expect(typeof res.body.file_size_bytes).toBe('number');

      // Verify sensitive/internal fields are NOT exposed (Item 2)
      expect(res.body).not.toHaveProperty('stored_path');
      expect(res.body).not.toHaveProperty('owner_id');
      expect(res.body).not.toHaveProperty('attempts');
    });

    it('returns progress_percentage as 100 when status is COMPLETED even if total_rows is null', async () => {
      const insertRes = await pool.query(
        `INSERT INTO import_jobs (
           owner_id, original_filename, stored_path, file_size_bytes, status
         ) VALUES ($1, $2, $3, $4, 'COMPLETED')
         RETURNING id;`,
        [ownerId, 'done.csv', '/tmp/done.csv', 500],
      );
      const jobId = insertRes.rows[0].id;

      const res = await request(app).get(`/api/v1/imports/${jobId}`).set('X-API-Key', env.API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('COMPLETED');
      expect(res.body.progress_percentage).toBe(100);
    });
  });

  // =========================================================================
  // 6. Import Listing Endpoint (GET /api/v1/imports)
  // =========================================================================
  describe('GET /api/v1/imports (Paginated History)', () => {
    beforeEach(async () => {
      // Seed 3 jobs for the current user and 2 jobs for another user
      for (let i = 1; i <= 3; i++) {
        await pool.query(
          `INSERT INTO import_jobs (owner_id, original_filename, stored_path, file_size_bytes, status)
           VALUES ($1, $2, $3, $4, 'PENDING');`,
          [ownerId, `job_${i}.csv`, `/tmp/job_${i}.csv`, 1000 * i],
        );
      }

      for (let j = 1; j <= 2; j++) {
        await pool.query(
          `INSERT INTO import_jobs (owner_id, original_filename, stored_path, file_size_bytes, status)
           VALUES ('foreign-owner', $1, $2, 500, 'PENDING');`,
          [`foreign_${j}.csv`, `/tmp/foreign_${j}.csv`],
        );
      }
    });

    it('returns paginated list containing only current user jobs without internal fields', async () => {
      const res = await request(app).get('/api/v1/imports').set('X-API-Key', env.API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(3);
      expect(res.body.items.length).toBe(3);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(20);
      expect(res.body.totalPages).toBe(1);

      // Verify all returned jobs are sanitized (Item 2)
      for (const item of res.body.items) {
        expect(item).not.toHaveProperty('stored_path');
        expect(item).not.toHaveProperty('owner_id');
        expect(item).not.toHaveProperty('attempts');
        expect(typeof item.file_size_bytes).toBe('number');
      }
    });

    it('respects page and limit query parameters', async () => {
      const res = await request(app)
        .get('/api/v1/imports?page=2&limit=2')
        .set('X-API-Key', env.API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(3);
      expect(res.body.items.length).toBe(1);
      expect(res.body.page).toBe(2);
      expect(res.body.limit).toBe(2);
      expect(res.body.totalPages).toBe(2);
    });

    it('rejects invalid limit exceeding 100 with 400 Validation Error', async () => {
      const res = await request(app).get('/api/v1/imports?limit=150').set('X-API-Key', env.API_KEY);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.fieldErrors).toHaveProperty('limit');
    });

    it('rejects invalid negative page with 400 Validation Error', async () => {
      const res = await request(app).get('/api/v1/imports?page=-1').set('X-API-Key', env.API_KEY);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.fieldErrors).toHaveProperty('page');
    });
  });

  // =========================================================================
  // 7. 404 Not Found Middleware & Documentation
  // =========================================================================
  describe('Not Found & Swagger Documentation', () => {
    it('returns 404 for unknown route (/api/v1/unknown)', async () => {
      const res = await request(app).get('/api/v1/unknown-endpoint');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(res.body.error.message).toContain('Cannot GET /api/v1/unknown-endpoint');
    });

    it('serves Swagger documentation at /docs/', async () => {
      const res = await request(app).get('/docs/');

      // swaggerUi returns 200 HTML page
      expect([200, 301]).toContain(res.status);
    });
  });
});
