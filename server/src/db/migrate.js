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

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

export async function runMigrations({ reset: shouldReset = false, silent = false } = {}) {
  if (shouldReset) await reset();
  await ensureMigrationsTable();

  const { rows } = await pool.query('SELECT filename FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.filename));

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();

  let count = 0;
  for (const filename of files) {
    if (applied.has(filename)) continue;
    const sql = await readFile(join(migrationsDir, filename), 'utf8');

    // Each migration is one transaction: a failure half-way leaves nothing behind.
    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
    });

    count += 1;
    if (!silent) console.log(`[migrate] applied ${filename}`);
  }

  if (!silent && count === 0) console.log('[migrate] already up to date');
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
