import { createApp } from './app.js';
import { config } from './config.js';
import { pool, closePool } from './db/pool.js';

const app = createApp();

async function start() {
  // Fail loudly at boot rather than on the first request.
  await pool.query('SELECT 1');

  const server = app.listen(config.port, () => {
    console.log(`[api] listening on http://localhost:${config.port} (${config.nodeEnv})`);
  });

  const shutdown = async (signal) => {
    console.log(`[api] ${signal} received, shutting down`);
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
    // Don't let an open connection hold the process open indefinitely.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  console.error('[api] failed to start:', err.message);
  process.exit(1);
});
