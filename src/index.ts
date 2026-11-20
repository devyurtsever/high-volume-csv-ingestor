import { createApp } from './api/app.js';
import { env } from './config/env.js';
import { logger } from './shared/logger.js';

const app = createApp();

const server = app.listen(env.PORT, env.HOST, () => {
  logger.info(`Server running at http://${env.HOST}:${env.PORT} in ${env.NODE_ENV} mode`);
});

const shutdown = (signal: string) => {
  logger.info(`Received ${signal}. Gracefully shutting down HTTP server...`);
  server.close(() => {
    logger.info('HTTP server closed. Exiting process.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
