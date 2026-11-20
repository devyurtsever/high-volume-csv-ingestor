import { env } from './config/env.js';
import { logger } from './shared/logger.js';

logger.info(
  `Worker placeholder started. Concurrency: ${env.WORKER_CONCURRENCY}, Batch Size: ${env.BATCH_SIZE}`,
);

const shutdown = (signal: string) => {
  logger.info(`Received ${signal}. Shutting down worker...`);
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
