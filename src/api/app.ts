import express, { type Express, type Request, type Response } from 'express';
import helmet from 'helmet';

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(express.json());

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  return app;
}
