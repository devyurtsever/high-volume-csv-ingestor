import { createApp } from './api/app.js';
import { env } from './config/env.js';
import { logger } from './shared/logger.js';

// Express HTTP API uygulamasını başlat
const app = createApp();

const server = app.listen(env.PORT, env.HOST, () => {
  logger.info(
    `API Sunucusu http://${env.HOST}:${env.PORT} adresinde (${env.NODE_ENV} modunda) çalışıyor`,
  );
});

// Sunucu kapatılırken mevcut isteklerin yarıda kalmasını önleyen kibar kapatma
const shutdown = (signal: string) => {
  logger.info(`${signal} sinyali alındı. HTTP sunucusu güvenle kapatılıyor...`);
  server.close(() => {
    logger.info('HTTP sunucusu kapatıldı. Süreç sonlandırılıyor.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
