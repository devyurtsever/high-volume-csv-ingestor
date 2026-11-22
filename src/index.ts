import { createApp } from './api/app.js';
import { env } from './config/env.js';
import { logger } from './shared/logger.js';

// Express HTTP API uygulamasını başlat
const app = createApp();

const server = app.listen(env.PORT, env.HOST, () => {
  logger.info(`API Server is running at http://${env.HOST}:${env.PORT} (${env.NODE_ENV} mode)`);
});

// Sunucu kapatılırken mevcut isteklerin yarıda kalmasını önleyen kibar kapatma
const shutdown = (signal: string) => {
  logger.info(`${signal} signal received. Gracefully shutting down HTTP server...`);
  server.close(() => {
    logger.info('HTTP server closed. Terminating process.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
