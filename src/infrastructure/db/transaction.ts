import type { Pool, PoolClient } from 'pg';
import { logger } from '../../shared/logger.js';

/**
 * Executes a callback within a managed database transaction.
 * Automatically handles BEGIN, COMMIT, ROLLBACK, and ensures client release.
 */
export async function withTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      logger.error({ rollbackError }, 'Error executing ROLLBACK on database client');
    }
    throw error;
  } finally {
    client.release();
  }
}
