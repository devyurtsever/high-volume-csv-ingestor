import fs from 'node:fs';
import path from 'node:path';
import express, { type Express, type Request, type Response } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import { loggingMiddleware } from './middlewares/logging.middleware.js';
import { rateLimitMiddleware } from './middlewares/rate-limit.middleware.js';
import { authMiddleware } from './middlewares/auth.middleware.js';
import { notFoundMiddleware } from './middlewares/not-found.middleware.js';
import { errorMiddleware } from './middlewares/error.middleware.js';
import { createImportRouter } from './routes/import.routes.js';
import { container } from './container.js';

export function createApp(appContainer = container): Express {
  const app = express();

  // 1. Request logging & security headers
  app.use(loggingMiddleware);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          'upgrade-insecure-requests': null,
        },
      },
    }),
  );
  app.use(rateLimitMiddleware);
  app.use(express.json());

  // 2. Swagger UI documentation (/docs)
  const openApiPath = path.resolve(process.cwd(), 'docs/openapi.yaml');
  if (fs.existsSync(openApiPath)) {
    const file = fs.readFileSync(openApiPath, 'utf8');
    const swaggerDoc = YAML.parse(file);
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc));
  }

  // 3. Health check endpoint (Public)
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // 4. API v1 Routes (Protected with X-API-Key)
  app.use(
    '/api/v1/imports',
    authMiddleware,
    createImportRouter(appContainer.importController, appContainer.reportController),
  );

  // 5. 404 & Central Error Handling
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}
