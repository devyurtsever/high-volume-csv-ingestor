import { env } from './config/env.js';
import { logger } from './shared/logger.js';

// Arka plan işçisi (Worker): API'den ayrı bir süreç olarak çalışır ve kuyruktaki CSV işleme görevlerini yürütür.
logger.info(
  `Worker süreci başlatıldı. Eşzamanlı dosya işleme: ${env.WORKER_CONCURRENCY}, Toplu yazma boyutu: ${env.BATCH_SIZE}`,
);

// Worker kapatılırken işlemi güvenle durdurma (Graceful Shutdown)
const shutdown = (signal: string) => {
  logger.info(`${signal} sinyali alındı. Worker güvenle kapatılıyor...`);
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
