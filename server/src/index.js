/**
 * Entry point.
 *
 * Modules are imported dynamically so that a configuration problem -- a
 * missing JWT_SECRET, a frontend build that was never run -- is reported as a
 * single readable line instead of a module-load stack trace. These are the
 * errors people read in a deployment log, usually in a hurry.
 */
async function start() {
  const { createApp } = await import('./app.js');
  const { config } = await import('./config.js');
  const { pool, closePool } = await import('./db/pool.js');

  const app = createApp();

  // Fail loudly at boot rather than on the first request.
  await pool.query('SELECT 1');

  // Migrations run here, not in the build step. A hosting platform's build
  // phase generally cannot reach the database's private network, so a build
  // that migrates fails for reasons unrelated to the code. Startup always
  // can, and an advisory lock keeps concurrent instances from racing.
  if (config.migrateOnStart) {
    const { runMigrations } = await import('./db/migrate.js');
    await runMigrations({ silent: true });
  }

  const server = app.listen(config.port, () => {
    console.log(`[api] listening on http://localhost:${config.port} (${config.nodeEnv})`);
    if (config.serveWeb) console.log(`[api] serving the web build from ${config.webDistPath}`);
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
  console.error(`[api] failed to start: ${err.message}`);
  process.exit(1);
});
