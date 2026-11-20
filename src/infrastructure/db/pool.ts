import pg from 'pg';
import { env } from '../../config/env.js';
import { logger } from '../../shared/logger.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_MAX_CONNECTIONS,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected idle client error in PostgreSQL pool');
});

export async function closePool(): Promise<void> {
  await pool.end();
}
