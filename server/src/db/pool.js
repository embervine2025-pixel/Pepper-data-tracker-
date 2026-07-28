import pg from 'pg';
import { config } from '../config.js';

const { Pool, types } = pg;

// node-postgres hands back DATE as a JS Date in local time, which shifts
// harvest/sow dates across midnight depending on the server's zone. These are
// calendar dates, so keep them as plain YYYY-MM-DD strings.
types.setTypeParser(types.builtins.DATE, (value) => value);
// NUMERIC arrives as a string to protect precision; pod measurements are well
// inside float range and the API contract is numeric JSON.
types.setTypeParser(types.builtins.NUMERIC, (value) => (value === null ? null : Number(value)));
types.setTypeParser(types.builtins.INT8, (value) => (value === null ? null : Number(value)));

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: config.isTest ? 5 : 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  console.error('[db] idle client error', err);
});

export function query(text, params) {
  return pool.query(text, params);
}

/**
 * Run `fn` inside a transaction, committing on success and rolling back on
 * any thrown error. The callback receives the dedicated client, so every
 * statement inside must use it rather than the pool.
 */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('[db] rollback failed', rollbackErr);
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool() {
  await pool.end();
}
