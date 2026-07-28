import 'dotenv/config';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';

// A weak signing key in production would make every session forgeable, so
// the fallback only applies outside production.
const jwtSecret =
  nodeEnv === 'production'
    ? required('JWT_SECRET')
    : process.env.JWT_SECRET ?? 'dev-only-insecure-secret';

export const config = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isTest: nodeEnv === 'test',
  port: Number(process.env.PORT ?? 4000),
  // Tests get their own database so a run never touches development data.
  databaseUrl:
    nodeEnv === 'test'
      ? process.env.TEST_DATABASE_URL ?? 'postgres://pepper:pepper@127.0.0.1:5432/pepper_test'
      : process.env.DATABASE_URL ?? 'postgres://pepper:pepper@127.0.0.1:5432/pepper_dev',
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? (nodeEnv === 'test' ? 4 : 12)),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',

  /**
   * In production the API also serves the built React app, so the whole thing
   * is one origin on one port: no CORS, and the client's relative /api calls
   * resolve without configuration. In development Vite serves the frontend
   * and proxies /api here instead, so this stays off.
   *
   * Set SERVE_WEB=false to run the API alone behind a separate static host.
   */
  serveWeb: (process.env.SERVE_WEB ?? String(nodeEnv === 'production')) === 'true',
  webDistPath: resolve(process.env.WEB_DIST_PATH ?? join(here, '..', '..', 'web', 'dist')),
};
