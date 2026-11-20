import pg from 'pg';
import { env } from '../../config/env.js';
import { logger } from '../../shared/logger.js';

const { Pool } = pg;

/* resolvedConnectionString:  Integration testler veritabanını TRUNCATE ettiği için testler çalışırken
geliştirme ortamındaki verilerin kaybolmaması adına ortam kontrolü yaptık */
const resolvedConnectionString =
  env.NODE_ENV === 'test' && !process.env.DATABASE_URL
    ? env.DATABASE_URL.replace(/\/customer_import_db(\?.*)?$/, '/customer_import_test$1')
    : env.DATABASE_URL;

export const pool = new Pool({
  connectionString: resolvedConnectionString,
  max: env.DB_MAX_CONNECTIONS,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

/* Havuzda boşta bekleyen bağlantılarda beklenmeyen bir kopma (network timeout, 
postgres restart vb.) olursa Node.jsin çökmesini engeller.
*/
pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected idle client error in PostgreSQL pool');
});

/* Testler bittiğinde açık soket kalmaması veya sunucu kapatılırken
postgres üzerinde hayalet bağlantı kalmaması için havuzu kibarca kapatır. */
export async function closePool(): Promise<void> {
  await pool.end();
}
