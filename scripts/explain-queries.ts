import pg from 'pg';
import { env } from '../src/config/env.js';

const { Pool } = pg;

async function runExplain() {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
  });

  try {
    console.log('=== 1. Keyset Pagination EXPLAIN (ANALYZE, BUFFERS) ===\n');

    // import_row_errors tablosunda var olan bir import_id seç
    const jobRes = await pool.query('SELECT id FROM import_jobs LIMIT 1;');
    const sampleId = jobRes.rows[0]?.id || '00000000-0000-0000-0000-000000000000';

    const keysetExplain = await pool.query(
      `EXPLAIN (ANALYZE, BUFFERS)
       SELECT row_number, error_type, error_codes, error_message, raw_data
       FROM import_row_errors
       WHERE import_id = $1 AND row_number > 0
       ORDER BY row_number ASC
       LIMIT 20;`,
      [sampleId],
    );

    for (const row of keysetExplain.rows) {
      console.log(row['QUERY PLAN']);
    }

    console.log('\n=== 2. Customers Unique Constraint Conflict Check EXPLAIN ===\n');

    const customerExplain = await pool.query(
      `EXPLAIN (ANALYZE, BUFFERS)
       SELECT customer_id, national_id
       FROM customers
       WHERE national_id = '10000000146' OR customer_id = 'CUST-0000001';`,
    );

    for (const row of customerExplain.rows) {
      console.log(row['QUERY PLAN']);
    }
  } finally {
    await pool.end();
  }
}

runExplain().catch((err) => {
  console.error('[explain-queries] Error:', err);
  process.exit(1);
});
