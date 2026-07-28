/**
 * Applies every .sql file in ./migrations in filename order, recording what
 * has run in `schema_migrations` so re-runs are no-ops.
 *
 *   node src/db/migrate.js           apply pending migrations
 *   node src/db/migrate.js --reset   drop the public schema first
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, withTransaction, closePool } from './pool.js';
import { config } from '../config.js';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

async function reset() {
  if (config.isProduction) {
    throw new Error('Refusing to reset the schema in production');
  }
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  console.log('[migrate] schema reset');
}

// Takes the caller's client so it runs on the connection holding the lock.
async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

// Arbitrary but fixed: every process that migrates this database must ask for
// the same lock id for the lock to mean anything.
const MIGRATION_LOCK_ID = 8274123456789;

export async function runMigrations({ reset: shouldReset = false, silent = false } = {}) {
  if (shouldReset) await reset();

  // Migrations run at server startup, so on a deploy with more than one
  // instance several processes reach this at once. A session-level advisory
  // lock serialises them: the first applies the pending files, the rest wait
  // and then find nothing to do.
  //
  // The lock is taken before the bookkeeping table is created, not after.
  // CREATE TABLE IF NOT EXISTS is not atomic in PostgreSQL -- it checks, then
  // creates -- so two processes running it together fail with a duplicate key
  // on pg_type_typname_nsp_index. Everything that touches the schema has to
  // sit inside the lock.
  const client = await pool.connect();
  let count = 0;

  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    await ensureMigrationsTable(client);

    const { rows } = await client.query('SELECT filename FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.filename));

    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();

    for (const filename of files) {
      if (applied.has(filename)) continue;
      const sql = await readFile(join(migrationsDir, filename), 'utf8');

      // Each migration is one transaction: a failure half-way leaves nothing behind.
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      }

      count += 1;
      if (!silent) console.log(`[migrate] applied ${filename}`);
    }

    if (!silent && count === 0) console.log('[migrate] already up to date');
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => {});
    client.release();
  }

  return count;
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  runMigrations({ reset: process.argv.includes('--reset') })
    .then(() => closePool())
    .catch(async (err) => {
      console.error('[migrate] failed:', err.message);
      await closePool().catch(() => {});
      process.exit(1);
    });
}
