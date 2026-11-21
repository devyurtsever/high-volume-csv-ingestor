import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../../src/infrastructure/db/pool.js';
import { PgImportRepository } from '../../src/infrastructure/repositories/pg-import.repository.js';
import { LocalFileStorage } from '../../src/infrastructure/storage/local-file.storage.js';
import { ImportProcessorService } from '../../src/application/services/import-processor.service.js';

describe('Worker Import Processor Integration Tests (Phase 4)', () => {
  const repository = new PgImportRepository(pool);
  const storage = new LocalFileStorage();
  const processor = new ImportProcessorService(repository, storage);

  const testDir = path.join(os.tmpdir(), `worker-test-${Date.now()}`);

  beforeAll(async () => {
    // Safety guard
    const dbUrl = pool.options.connectionString ?? '';
    if (!dbUrl.includes('test')) {
      throw new Error(`Integration tests must target a test database. Current URL: ${dbUrl}`);
    }
    await fs.promises.mkdir(testDir, { recursive: true });
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE import_row_errors, customers, import_jobs CASCADE;');
  });

  afterAll(async () => {
    await fs.promises.rm(testDir, { recursive: true, force: true });
  });

  it('should process a mixed CSV file (valid, invalid, duplicate) and finish with PARTIALLY_COMPLETED', async () => {
    // 1. Test CSV dosyası oluştur
    // Satır 2: Geçerli Müşteri 1 (TCKN: 10000000146)
    // Satır 3: Geçerli Müşteri 2 (TCKN: 12345678950)
    // Satır 4: Geçersiz Satır (Hatalı TCKN: 11111111111, Hatalı telefon)
    // Satır 5: Mükerrer Satır (Satır 2 ile aynı TCKN: 10000000146, farklı customer_id)
    const csvContent = [
      'Customer ID,First Name,Last Name,National ID,Email,Phone,Birth Date,Created Date',
      'CUST-001,Ahmet,Yilmaz,10000000146,ahmet@example.com,+905551234567,1990-01-01,2023-01-01',
      'CUST-002,Ayse,Kaya,12345678950,ayse@example.com,05559876543,1995-05-15,2023-02-01',
      'CUST-003,Mehmet,Demir,11111111111,invalid-email,12345,1988-12-10,2023-03-01',
      'CUST-004,Ahmet 2,Yilmaz,10000000146,ahmet2@example.com,+905551234568,1990-01-01,2023-01-01',
    ].join('\n');

    const filePath = path.join(testDir, 'mixed.csv');
    await fs.promises.writeFile(filePath, csvContent);

    // 2. Veritabanında PENDING durumunda import_jobs kaydı aç
    const jobRes = await pool.query(
      `INSERT INTO import_jobs (owner_id, original_filename, stored_path, file_size_bytes, status)
       VALUES ('test-owner', 'mixed.csv', $1, 500, 'PENDING')
       RETURNING id;`,
      [filePath],
    );
    const importId = jobRes.rows[0].id;

    // 3. Worker processor'ı doğrudan çağır (413 dosya boyutu limitinden muaf)
    await processor.processImport({
      importId,
      storedPath: filePath,
      originalFilename: 'mixed.csv',
    });

    // 4. import_jobs sayaçlarını ve durumunu doğrula
    const updatedJobRes = await pool.query('SELECT * FROM import_jobs WHERE id = $1', [importId]);
    const job = updatedJobRes.rows[0];

    expect(job.status).toBe('PARTIALLY_COMPLETED');
    expect(job.total_rows).toBe(4);
    expect(job.processed_rows).toBe(4);
    expect(job.success_rows).toBe(2);
    expect(job.failed_rows).toBe(1);
    expect(job.duplicate_rows).toBe(1);
    expect(job.last_committed_row).toBe(5);
    expect(job.finished_at).not.toBeNull();

    // 5. customers tablosunu doğrula (yalnızca CUST-001 ve CUST-002 eklenmiş olmalı)
    const customersRes = await pool.query(
      'SELECT customer_id, national_id, phone FROM customers WHERE source_import_id = $1 ORDER BY source_row_number ASC',
      [importId],
    );
    expect(customersRes.rows).toHaveLength(2);
    expect(customersRes.rows[0].customer_id).toBe('CUST-001');
    expect(customersRes.rows[0].national_id).toBe('10000000146');
    expect(customersRes.rows[0].phone).toBe('+905551234567');
    expect(customersRes.rows[1].customer_id).toBe('CUST-002');
    expect(customersRes.rows[1].phone).toBe('+905559876543');

    // 6. import_row_errors tablosunu doğrula (satır 4 doğrulama hatası, satır 5 mükerrer hatası)
    const errorsRes = await pool.query(
      'SELECT row_number, error_type, error_codes, error_message FROM import_row_errors WHERE import_id = $1 ORDER BY row_number ASC',
      [importId],
    );
    expect(errorsRes.rows).toHaveLength(2);

    expect(errorsRes.rows[0].row_number).toBe(4);
    expect(errorsRes.rows[0].error_type).toBe('VALIDATION');
    expect(errorsRes.rows[0].error_codes).toContain('INVALID_NATIONAL_ID');
    expect(errorsRes.rows[0].error_codes).toContain('INVALID_EMAIL');
    expect(errorsRes.rows[0].error_codes).toContain('INVALID_PHONE');

    expect(errorsRes.rows[1].row_number).toBe(5);
    expect(errorsRes.rows[1].error_type).toBe('DUPLICATE');
    expect(errorsRes.rows[1].error_codes).toContain('DUPLICATE_RECORD');
  });

  it('should support semicolon delimiter and UTF-8 BOM smoothly', async () => {
    const csvContent =
      '\uFEFF' +
      [
        'Customer ID;First Name;Last Name;National ID;Email;Phone;Birth Date;Created Date',
        'CUST-SEM-1;Ali;Demir;11111111110;ali.demir@example.com;+905551112233;1985-04-20;2023-05-01',
      ].join('\n');

    const filePath = path.join(testDir, 'semicolon.csv');
    await fs.promises.writeFile(filePath, csvContent);

    const jobRes = await pool.query(
      `INSERT INTO import_jobs (owner_id, original_filename, stored_path, file_size_bytes, status)
       VALUES ('test-owner', 'semicolon.csv', $1, 200, 'PENDING')
       RETURNING id;`,
      [filePath],
    );
    const importId = jobRes.rows[0].id;

    await processor.processImport({
      importId,
      storedPath: filePath,
      originalFilename: 'semicolon.csv',
    });

    const updatedJobRes = await pool.query('SELECT * FROM import_jobs WHERE id = $1', [importId]);
    const job = updatedJobRes.rows[0];

    expect(job.status).toBe('COMPLETED');
    expect(job.success_rows).toBe(1);
    expect(job.failed_rows).toBe(0);
    expect(job.duplicate_rows).toBe(0);
  });

  it('should resume from checkpoint (last_committed_row) without double-inserting', async () => {
    // 3 satırlık dosya: 1. ve 2. satır daha önceden işlenmiş (last_committed_row = 3)
    const csvContent = [
      'Customer ID,First Name,Last Name,National ID,Email,Phone,Birth Date,Created Date',
      'CUST-R1,Ahmet,Yilmaz,10000000146,ahmet@example.com,+905551234567,1990-01-01,2023-01-01',
      'CUST-R2,Ayse,Kaya,12345678950,ayse@example.com,+905559876543,1995-05-15,2023-02-01',
      'CUST-R3,Mehmet,Demir,11111111110,mehmet@example.com,+905551112233,1988-12-10,2023-03-01',
    ].join('\n');

    const filePath = path.join(testDir, 'resume.csv');
    await fs.promises.writeFile(filePath, csvContent);

    // Önceden CUST-R1 ve CUST-R2 eklenmiş, checkpoint last_committed_row=3 olarak ayarlanmış
    const jobRes = await pool.query(
      `INSERT INTO import_jobs (
        owner_id, original_filename, stored_path, file_size_bytes, status,
        total_rows, processed_rows, success_rows, failed_rows, duplicate_rows, last_committed_row
       )
       VALUES ('test-owner', 'resume.csv', $1, 300, 'PROCESSING', 3, 2, 2, 0, 0, 3)
       RETURNING id;`,
      [filePath],
    );
    const importId = jobRes.rows[0].id;

    // Önceden eklenen müşterileri simüle et
    await pool.query(
      `INSERT INTO customers (customer_id, national_id, first_name, last_name, email, phone, birth_date, created_date, source_import_id, source_row_number)
       VALUES
       ('CUST-R1', '10000000146', 'Ahmet', 'Yilmaz', 'ahmet@example.com', '+905551234567', '1990-01-01', '2023-01-01', $1, 2),
       ('CUST-R2', '12345678950', 'Ayse', 'Kaya', 'ayse@example.com', '+905559876543', '1995-05-15', '2023-02-01', $1, 3);`,
      [importId],
    );

    // İşlemi tekrar başlat (resume)
    await processor.processImport({
      importId,
      storedPath: filePath,
      originalFilename: 'resume.csv',
    });

    const updatedJob = (await pool.query('SELECT * FROM import_jobs WHERE id = $1', [importId]))
      .rows[0];

    // Toplam 3 satır işlenmiş olmalı, 3'ü de başarılı
    expect(updatedJob.status).toBe('COMPLETED');
    expect(updatedJob.processed_rows).toBe(3);
    expect(updatedJob.success_rows).toBe(3);
    expect(updatedJob.last_committed_row).toBe(4);

    // customers tablosunda toplam 3 müşteri olmalı
    const customersCount = await pool.query(
      'SELECT COUNT(*)::int AS count FROM customers WHERE source_import_id = $1',
      [importId],
    );
    expect(customersCount.rows[0].count).toBe(3);
  });

  it('should skip gracefully if job is already COMPLETED (Idempotency)', async () => {
    const filePath = path.join(testDir, 'already-done.csv');
    await fs.promises.writeFile(filePath, 'Customer ID,First Name\nC1,Ali\n');

    const jobRes = await pool.query(
      `INSERT INTO import_jobs (owner_id, original_filename, stored_path, file_size_bytes, status)
       VALUES ('test-owner', 'already-done.csv', $1, 100, 'COMPLETED')
       RETURNING id;`,
      [filePath],
    );
    const importId = jobRes.rows[0].id;

    // Tetikle
    await processor.processImport({
      importId,
      storedPath: filePath,
      originalFilename: 'already-done.csv',
    });

    const job = (await pool.query('SELECT * FROM import_jobs WHERE id = $1', [importId])).rows[0];
    expect(job.status).toBe('COMPLETED');
    expect(job.processed_rows).toBe(0);
  });

  it('should handle unrecoverable missing file and mark job FAILED', async () => {
    const nonExistentPath = path.join(testDir, 'does-not-exist.csv');

    const jobRes = await pool.query(
      `INSERT INTO import_jobs (owner_id, original_filename, stored_path, file_size_bytes, status)
       VALUES ('test-owner', 'missing.csv', $1, 100, 'PENDING')
       RETURNING id;`,
      [nonExistentPath],
    );
    const importId = jobRes.rows[0].id;

    await expect(
      processor.processImport({
        importId,
        storedPath: nonExistentPath,
        originalFilename: 'missing.csv',
      }),
    ).rejects.toThrow('Stored file not found');

    const job = (await pool.query('SELECT * FROM import_jobs WHERE id = $1', [importId])).rows[0];
    expect(job.status).toBe('FAILED');
    expect(job.error_message).toContain('Stored file not found');
  });

  it('should handle unrecoverable corrupt CSV syntax (unclosed quote) and mark job FAILED', async () => {
    const corruptContent = [
      'Customer ID,First Name,Last Name,National ID,Email,Phone,Birth Date,Created Date',
      'CUST-001,"Ahmet,Yilmaz,10000000146,ahmet@example.com,+905551234567,1990-01-01,2023-01-01', // tırnak kapanmamış
    ].join('\n');

    const filePath = path.join(testDir, 'corrupt.csv');
    await fs.promises.writeFile(filePath, corruptContent);

    const jobRes = await pool.query(
      `INSERT INTO import_jobs (owner_id, original_filename, stored_path, file_size_bytes, status)
       VALUES ('test-owner', 'corrupt.csv', $1, 150, 'PENDING')
       RETURNING id;`,
      [filePath],
    );
    const importId = jobRes.rows[0].id;

    await expect(
      processor.processImport({
        importId,
        storedPath: filePath,
        originalFilename: 'corrupt.csv',
      }),
    ).rejects.toThrow();

    const job = (await pool.query('SELECT * FROM import_jobs WHERE id = $1', [importId])).rows[0];
    expect(job.status).toBe('FAILED');
  });

  it('should handle rows with missing or extra columns as VALIDATION errors without failing the entire file', async () => {
    // Satır 2: Geçerli Müşteri 1
    // Satır 3: Eksik kolonlu satır (sadece 3 kolon var)
    // Satır 4: Fazla kolonlu satır (10 kolon var ve TCKN geçersiz)
    // Satır 5: Geçerli Müşteri 2
    const csvContent = [
      'Customer ID,First Name,Last Name,National ID,Email,Phone,Birth Date,Created Date',
      'CUST-COL-1,Ahmet,Yilmaz,10000000146,ahmet.col@example.com,+905551234567,1990-01-01,2023-01-01',
      'CUST-SHORT,Mehmet,Demir', // eksik kolonlar
      'CUST-EXTRA,Ayse,Kaya,11111111111,bad-email,+905551112233,1995-05-15,2023-02-01,EXTRA1,EXTRA2', // fazla kolonlar + geçersiz TCKN
      'CUST-COL-2,Fatma,Sahin,36548174514,fatma.col@example.com,+905559876543,1992-06-20,2023-03-01',
    ].join('\n');

    const filePath = path.join(testDir, 'column-mismatch.csv');
    await fs.promises.writeFile(filePath, csvContent);

    const jobRes = await pool.query(
      `INSERT INTO import_jobs (owner_id, original_filename, stored_path, file_size_bytes, status)
       VALUES ('test-owner', 'column-mismatch.csv', $1, 300, 'PENDING')
       RETURNING id;`,
      [filePath],
    );
    const importId = jobRes.rows[0].id;

    await processor.processImport({
      importId,
      storedPath: filePath,
      originalFilename: 'column-mismatch.csv',
    });

    const job = (await pool.query('SELECT * FROM import_jobs WHERE id = $1', [importId])).rows[0];

    // Dosya FAILED olmamalı, kısmen tamamlanmalı
    expect(job.status).toBe('PARTIALLY_COMPLETED');
    expect(job.processed_rows).toBe(4);
    expect(job.success_rows).toBe(2);
    expect(job.failed_rows).toBe(2);
    expect(job.duplicate_rows).toBe(0);

    // import_row_errors tablosunda 3. ve 4. satırlar VALIDATION hatası olarak bulunmalı
    const errorsRes = await pool.query(
      'SELECT row_number, error_type, error_codes FROM import_row_errors WHERE import_id = $1 ORDER BY row_number ASC',
      [importId],
    );
    expect(errorsRes.rows).toHaveLength(2);

    expect(errorsRes.rows[0].row_number).toBe(3);
    expect(errorsRes.rows[0].error_type).toBe('VALIDATION');
    expect(errorsRes.rows[0].error_codes).toContain('REQUIRED_FIELD_MISSING');

    expect(errorsRes.rows[1].row_number).toBe(4);
    expect(errorsRes.rows[1].error_type).toBe('VALIDATION');
    expect(errorsRes.rows[1].error_codes).toContain('INVALID_NATIONAL_ID');

    // customers tablosunda yalnızca geçerli 2 müşteri olmalı
    const customersRes = await pool.query(
      'SELECT customer_id FROM customers WHERE source_import_id = $1 ORDER BY source_row_number ASC',
      [importId],
    );
    expect(customersRes.rows).toHaveLength(2);
    expect(customersRes.rows[0].customer_id).toBe('CUST-COL-1');
    expect(customersRes.rows[1].customer_id).toBe('CUST-COL-2');
  });
});
