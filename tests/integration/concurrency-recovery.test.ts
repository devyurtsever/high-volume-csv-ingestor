import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { env } from '../../src/config/env.js';
import { pool } from '../../src/infrastructure/db/pool.js';
import { PgImportRepository } from '../../src/infrastructure/repositories/pg-import.repository.js';
import { LocalFileStorage } from '../../src/infrastructure/storage/local-file.storage.js';
import { ImportProcessorService } from '../../src/application/services/import-processor.service.js';

describe('Concurrency and Crash Recovery Integration Tests (Phase 6)', () => {
  const repository = new PgImportRepository(pool);
  const storage = new LocalFileStorage();
  const processor = new ImportProcessorService(repository, storage);

  const testDir = path.join(os.tmpdir(), `concurrency-test-${Date.now()}`);

  beforeAll(async () => {
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

  // Geçerli TCKN üretici yardımcısı (Algoritmik doğruluğu %100)
  function generateValidTckn(seedIndex: number): string {
    // 9 haneli benzersiz gövde (ilk hane 0 olamaz)
    const base = String(100000000 + (seedIndex % 899999999)).padStart(9, '0');
    const digits = base.split('').map(Number);

    const oddSum = digits[0] + digits[2] + digits[4] + digits[6] + digits[8];
    const evenSum = digits[1] + digits[3] + digits[5] + digits[7];

    const d10 = (((oddSum * 7 - evenSum) % 10) + 10) % 10;
    const first10Sum = digits.reduce((acc, d) => acc + d, 0) + d10;
    const d11 = first10Sum % 10;

    return `${base}${d10}${d11}`;
  }

  it('(a) should handle concurrent ingestion of two overlapping files without data loss or race conditions', async () => {
    // İki dosya: 20 ortak müşteri, 10 dosya A'ya özel, 10 dosya B'ye özel (Toplam 40 tekil müşteri)
    const header =
      'Customer ID,First Name,Last Name,National ID,Email,Phone,Birth Date,Created Date';

    const sharedRows: string[] = [];
    for (let i = 1; i <= 20; i++) {
      const tckn = generateValidTckn(i);
      sharedRows.push(
        `SHARED-${i},Shared${i},Customer,${tckn},shared${i}@example.com,055511100${String(i).padStart(2, '0')},1990-01-01,2023-01-01`,
      );
    }

    const uniqueRowsA: string[] = [];
    for (let i = 1; i <= 10; i++) {
      const tckn = generateValidTckn(100 + i);
      uniqueRowsA.push(
        `FILEA-${i},OnlyA${i},Customer,${tckn},onlya${i}@example.com,055522200${String(i).padStart(2, '0')},1991-02-02,2023-02-02`,
      );
    }

    const uniqueRowsB: string[] = [];
    for (let i = 1; i <= 10; i++) {
      const tckn = generateValidTckn(200 + i);
      uniqueRowsB.push(
        `FILEB-${i},OnlyB${i},Customer,${tckn},onlyb${i}@example.com,055533300${String(i).padStart(2, '0')},1992-03-03,2023-03-03`,
      );
    }

    const fileAContent = [header, ...sharedRows, ...uniqueRowsA].join('\n');
    const fileBContent = [header, ...sharedRows, ...uniqueRowsB].join('\n');

    const pathA = path.join(testDir, 'overlapA.csv');
    const pathB = path.join(testDir, 'overlapB.csv');
    await fs.promises.writeFile(pathA, fileAContent);
    await fs.promises.writeFile(pathB, fileBContent);

    // İki ayrı PENDING import_job kaydı aç
    const jobARes = await pool.query(
      `INSERT INTO import_jobs (owner_id, original_filename, stored_path, file_size_bytes, status)
       VALUES ('owner-1', 'overlapA.csv', $1, 2000, 'PENDING') RETURNING id;`,
      [pathA],
    );
    const importIdA = jobARes.rows[0].id;

    const jobBRes = await pool.query(
      `INSERT INTO import_jobs (owner_id, original_filename, stored_path, file_size_bytes, status)
       VALUES ('owner-1', 'overlapB.csv', $1, 2000, 'PENDING') RETURNING id;`,
      [pathB],
    );
    const importIdB = jobBRes.rows[0].id;

    // İki işi aynı anda (eşzamanlı) çalıştır
    await Promise.all([
      processor.processImport({
        importId: importIdA,
        storedPath: pathA,
        originalFilename: 'overlapA.csv',
      }),
      processor.processImport({
        importId: importIdB,
        storedPath: pathB,
        originalFilename: 'overlapB.csv',
      }),
    ]);

    // 1. customers tablosunda TAM 40 tekil müşteri olmalı (20 shared + 10 onlyA + 10 onlyB)
    const countRes = await pool.query('SELECT COUNT(*) as cnt FROM customers;');
    expect(Number(countRes.rows[0].cnt)).toBe(40);

    // 2. İki işin durumlarını kontrol et
    const jobsRes = await pool.query(
      'SELECT id, status, total_rows, processed_rows, success_rows, duplicate_rows, failed_rows FROM import_jobs WHERE id IN ($1, $2);',
      [importIdA, importIdB],
    );
    expect(jobsRes.rows).toHaveLength(2);

    const jobA = jobsRes.rows.find((j) => j.id === importIdA);
    const jobB = jobsRes.rows.find((j) => j.id === importIdB);

    expect(jobA.processed_rows).toBe(30);
    expect(jobB.processed_rows).toBe(30);
    expect(jobA.failed_rows).toBe(0);
    expect(jobB.failed_rows).toBe(0);

    // 3. Toplam başarı ve mükerrer tutarlılığı:
    // Toplam başarı = 40 (tam olarak veritabanına eklenen tekil satır sayısı)
    // Toplam mükerrer = 20 (çakışan 20 ortak kayıttan kaynaklı)
    const totalSuccess = Number(jobA.success_rows) + Number(jobB.success_rows);
    const totalDuplicates = Number(jobA.duplicate_rows) + Number(jobB.duplicate_rows);

    expect(totalSuccess).toBe(40);
    expect(totalDuplicates).toBe(20);

    // Her iki iş de başarıyla bitmiş olmalı (COMPLETED veya PARTIALLY_COMPLETED)
    expect(['COMPLETED', 'PARTIALLY_COMPLETED']).toContain(jobA.status);
    expect(['COMPLETED', 'PARTIALLY_COMPLETED']).toContain(jobB.status);
  });

  it('(b) should correctly detect and isolate intra-file duplicate records within a single file', async () => {
    // 10 tekil müşteri; bunlardan ilk 5'i dosya içinde 2 kez tekrar ediyor (toplam 15 satır)
    const header =
      'Customer ID,First Name,Last Name,National ID,Email,Phone,Birth Date,Created Date';
    const rows: string[] = [];

    // 10 tekil kayıt
    for (let i = 1; i <= 10; i++) {
      const tckn = generateValidTckn(300 + i);
      rows.push(
        `CUST-${i},Name${i},Surname,${tckn},user${i}@example.com,055544400${String(i).padStart(2, '0')},1993-04-04,2023-04-04`,
      );
    }

    // İlk 5 kaydı tekrar ekle (aynı customer_id ve national_id)
    for (let i = 1; i <= 5; i++) {
      const tckn = generateValidTckn(300 + i);
      rows.push(
        `CUST-${i},DuplicateName${i},Surname,${tckn},dup${i}@example.com,055544400${String(i).padStart(2, '0')},1993-04-04,2023-04-04`,
      );
    }

    const fileContent = [header, ...rows].join('\n');
    const filePath = path.join(testDir, 'intra-duplicate.csv');
    await fs.promises.writeFile(filePath, fileContent);

    const jobRes = await pool.query(
      `INSERT INTO import_jobs (owner_id, original_filename, stored_path, file_size_bytes, status)
       VALUES ('owner-1', 'intra-duplicate.csv', $1, 1500, 'PENDING') RETURNING id;`,
      [filePath],
    );
    const importId = jobRes.rows[0].id;

    await processor.processImport({
      importId,
      storedPath: filePath,
      originalFilename: 'intra-duplicate.csv',
    });

    const updatedJob = (await pool.query('SELECT * FROM import_jobs WHERE id = $1;', [importId]))
      .rows[0];
    expect(updatedJob.status).toBe('PARTIALLY_COMPLETED');
    expect(updatedJob.total_rows).toBe(15);
    expect(updatedJob.processed_rows).toBe(15);
    expect(updatedJob.success_rows).toBe(10);
    expect(updatedJob.duplicate_rows).toBe(5);
    expect(updatedJob.failed_rows).toBe(0);

    // customers tablosunda tam 10 tekil müşteri olmalı
    const customersCount = (
      await pool.query('SELECT COUNT(*) as cnt FROM customers WHERE source_import_id = $1;', [
        importId,
      ])
    ).rows[0].cnt;
    expect(Number(customersCount)).toBe(10);

    // import_row_errors tablosunda 5 adet DUPLICATE hatası bulunmalı
    const errorsRes = await pool.query(
      'SELECT row_number, error_type, error_codes FROM import_row_errors WHERE import_id = $1 ORDER BY row_number ASC;',
      [importId],
    );
    expect(errorsRes.rows).toHaveLength(5);
    for (const err of errorsRes.rows) {
      expect(err.error_type).toBe('DUPLICATE');
      expect(err.error_codes).toContain('DUPLICATE_RECORD');
    }
  });

  it('(c) should recover gracefully from simulated batch commit failure using checkpoints (Crash Recovery with Error Injection)', async () => {
    // 12 satırlık geçerli dosya oluştur (satır 2..13)
    const header =
      'Customer ID,First Name,Last Name,National ID,Email,Phone,Birth Date,Created Date';
    const rows: string[] = [];
    for (let i = 1; i <= 12; i++) {
      const tckn = generateValidTckn(400 + i);
      rows.push(
        `CRASH-${i},Crash${i},Test,${tckn},crash${i}@example.com,055555500${String(i).padStart(2, '0')},1994-05-05,2023-05-05`,
      );
    }
    const fileContent = [header, ...rows].join('\n');
    const filePath = path.join(testDir, 'crash-recovery.csv');
    await fs.promises.writeFile(filePath, fileContent);

    const jobRes = await pool.query(
      `INSERT INTO import_jobs (owner_id, original_filename, stored_path, file_size_bytes, status)
       VALUES ('owner-1', 'crash-recovery.csv', $1, 1200, 'PENDING') RETURNING id;`,
      [filePath],
    );
    const importId = jobRes.rows[0].id;

    // Batch boyutunu geçici olarak 5 yapalım ki 12 satır 3 batch halinde (5 + 5 + 2) commit edilsin
    const originalBatchSize = env.BATCH_SIZE;
    (env as unknown as { BATCH_SIZE: number }).BATCH_SIZE = 5;

    // 1. ADIM: HATA ENJEKSİYONU (Error Injection)
    // 2. batch commit edilirken bilerek veritabanı çökme hatası simüle et
    const originalCommitBatch = repository.commitBatch.bind(repository);
    let commitCount = 0;
    let shouldInjectError = true;

    try {
      repository.commitBatch = async (input) => {
        if (input.importId === importId) {
          commitCount++;
          // 2. batch çağrısında bilinçli hata fırlat
          if (shouldInjectError && commitCount === 2) {
            throw new Error('Simulated database crash during batch commit (Crash Injection Test)');
          }
        }
        return originalCommitBatch(input);
      };

      // İlk çalıştırma: 2. batch'te hata fırlatmalı
      await expect(
        processor.processImport({
          importId,
          storedPath: filePath,
          originalFilename: 'crash-recovery.csv',
        }),
      ).rejects.toThrow('Simulated database crash during batch commit');

      // 2. ADIM: Çökme sonrası durum incelemesi
      const crashedJob = (await pool.query('SELECT * FROM import_jobs WHERE id = $1;', [importId]))
        .rows[0];
      // İlk batch (5 satır) başarıyla commit edilmişti, last_committed_row = 6 (başlık 1 + 5 satır)
      expect(crashedJob.last_committed_row).toBe(6);
      expect(crashedJob.success_rows).toBe(5);
      expect(crashedJob.processed_rows).toBe(5);

      // customers tablosunda sadece ilk batch'teki 5 müşteri olmalı
      const customersAfterCrash = (
        await pool.query('SELECT COUNT(*) as cnt FROM customers WHERE source_import_id = $1;', [
          importId,
        ])
      ).rows[0].cnt;
      expect(Number(customersAfterCrash)).toBe(5);

      // 3. ADIM: YENİDEN BAŞLATMA (Recovery Pass)
      // Hata enjeksiyonunu devre dışı bırak ve worker'ı tekrar tetikle
      shouldInjectError = false;

      await processor.processImport({
        importId,
        storedPath: filePath,
        originalFilename: 'crash-recovery.csv',
      });

      // 4. ADIM: İyileşme sonrası nihai durum doğrulaması
      const recoveredJob = (
        await pool.query('SELECT * FROM import_jobs WHERE id = $1;', [importId])
      ).rows[0];
      expect(recoveredJob.status).toBe('COMPLETED');
      expect(recoveredJob.total_rows).toBe(12);
      expect(recoveredJob.processed_rows).toBe(12);
      expect(recoveredJob.success_rows).toBe(12);
      expect(recoveredJob.duplicate_rows).toBe(0);
      expect(recoveredJob.failed_rows).toBe(0);
      expect(recoveredJob.last_committed_row).toBe(13); // Başlık (1) + 12 satır = 13

      // customers tablosunda hiçbir çift kayıt olmaksızın tam 12 müşteri olmalı
      const finalCustomers = await pool.query(
        'SELECT customer_id FROM customers WHERE source_import_id = $1 ORDER BY source_row_number ASC;',
        [importId],
      );
      expect(finalCustomers.rows).toHaveLength(12);
      expect(finalCustomers.rows[0].customer_id).toBe('CRASH-1');
      expect(finalCustomers.rows[11].customer_id).toBe('CRASH-12');
    } finally {
      // Temizlik: Orijinal fonksiyonu ve batch size'ı geri yükle
      repository.commitBatch = originalCommitBatch;
      (env as unknown as { BATCH_SIZE: number }).BATCH_SIZE = originalBatchSize;
    }
  });

  it('(d) should allow multiple worker instances to process distinct jobs concurrently', async () => {
    // 3 farklı dosya, 3 farklı import işi, 2 ayrı processor instance'ı
    const worker1 = new ImportProcessorService(repository, storage);
    const worker2 = new ImportProcessorService(repository, storage);

    const header =
      'Customer ID,First Name,Last Name,National ID,Email,Phone,Birth Date,Created Date';
    const files = ['multi1.csv', 'multi2.csv', 'multi3.csv'];
    const jobIds: string[] = [];

    for (let f = 0; f < files.length; f++) {
      const rows: string[] = [];
      for (let i = 1; i <= 10; i++) {
        const tckn = generateValidTckn(500 + f * 20 + i);
        rows.push(
          `MULTI-${f}-${i},MultiName${f},Surname,${tckn},multi${f}_${i}@example.com,055566600${String(i).padStart(2, '0')},1995-06-06,2023-06-06`,
        );
      }
      const filePath = path.join(testDir, files[f]);
      await fs.promises.writeFile(filePath, [header, ...rows].join('\n'));

      const res = await pool.query(
        `INSERT INTO import_jobs (owner_id, original_filename, stored_path, file_size_bytes, status)
         VALUES ('owner-1', $1, $2, 1000, 'PENDING') RETURNING id;`,
        [files[f], filePath],
      );
      jobIds.push(res.rows[0].id);
    }

    // 2 worker paralel olarak bu 3 işi tüketir
    await Promise.all([
      worker1.processImport({
        importId: jobIds[0],
        storedPath: path.join(testDir, files[0]),
        originalFilename: files[0],
      }),
      worker2.processImport({
        importId: jobIds[1],
        storedPath: path.join(testDir, files[1]),
        originalFilename: files[1],
      }),
      worker1.processImport({
        importId: jobIds[2],
        storedPath: path.join(testDir, files[2]),
        originalFilename: files[2],
      }),
    ]);

    // 3 iş de COMPLETED olmalı ve toplam 30 müşteri oluşmalı
    const finishedJobs = await pool.query(
      'SELECT id, status, success_rows FROM import_jobs WHERE id = ANY($1::uuid[]);',
      [jobIds],
    );
    expect(finishedJobs.rows).toHaveLength(3);
    for (const job of finishedJobs.rows) {
      expect(job.status).toBe('COMPLETED');
      expect(job.success_rows).toBe(10);
    }

    const totalCustomers = (
      await pool.query(
        'SELECT COUNT(*) as cnt FROM customers WHERE source_import_id = ANY($1::uuid[]);',
        [jobIds],
      )
    ).rows[0].cnt;
    expect(Number(totalCustomers)).toBe(30);
  });
});
