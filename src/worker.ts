import { pool, closePool } from './infrastructure/db/pool.js';
import { PgImportRepository } from './infrastructure/repositories/pg-import.repository.js';
import { LocalFileStorage } from './infrastructure/storage/local-file.storage.js';
import { ImportProcessorService } from './application/services/import-processor.service.js';
import { BullImportWorker } from './infrastructure/worker/bull-import.worker.js';
import { env } from './config/env.js';
import { logger } from './shared/logger.js';

logger.info(
  `Worker süreci başlatılıyor. Eşzamanlı dosya işleme: ${env.WORKER_CONCURRENCY}, Toplu yazma boyutu: ${env.BATCH_SIZE}`,
);

const repository = new PgImportRepository(pool);
const storage = new LocalFileStorage();
const processorService = new ImportProcessorService(repository, storage);
const importWorker = new BullImportWorker(processorService, repository);

logger.info('Worker süreci başarıyla başlatıldı ve kuyruk dinleniyor.');

// Worker kapatılırken işlemi ve bağlantıları güvenle durdurma (Graceful Shutdown)
let isShuttingDown = false;

const shutdown = async (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`${signal} sinyali alındı. Worker ve veritabanı bağlantıları güvenle kapatılıyor...`);
  try {
    await importWorker.close();
    await closePool();
    logger.info('Worker süreci başarıyla sonlandırıldı.');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Worker kapatılırken beklenmeyen hata oluştu');
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
