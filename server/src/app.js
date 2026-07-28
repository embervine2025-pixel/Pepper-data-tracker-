import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { optionalAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { authRouter } from './routes/auth.js';
import { plantsRouter } from './routes/plants.js';
import { pollinationsRouter } from './routes/pollinations.js';
import { podsRouter } from './routes/pods.js';
import { sharesRouter } from './routes/shares.js';
import { membersRouter } from './routes/members.js';
import { dashboardRouter } from './routes/dashboard.js';
import * as enums from './lib/enums.js';

export function createApp() {
  // Asserted here rather than at config load, so database-only tasks such as
  // migrations can run without it. Without a signing key every session would
  // be forgeable, so the API refuses to start.
  if (!config.jwtSecret) {
    throw new Error('Missing required environment variable: JWT_SECRET');
  }

  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: config.isTest ? 100_000 : 300,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.get('/api/health', (req, res) => res.json({ ok: true, service: 'pepper-api' }));

  // Enum vocabularies, so the frontend's dropdowns cannot drift from the
  // database's types.
  app.get('/api/meta/enums', (req, res) =>
    res.json({
      species: enums.CAPSICUM_SPECIES,
      visibility: enums.PLANT_VISIBILITY,
      plantStatus: enums.PLANT_STATUS,
      growthHabit: enums.GROWTH_HABIT,
      pollinationMethod: enums.POLLINATION_METHOD,
      pollinationOutcome: enums.POLLINATION_OUTCOME,
      podShape: enums.POD_SHAPE,
      podOrientation: enums.POD_ORIENTATION,
      podSurface: enums.POD_SURFACE,
      pungencyMethod: enums.PUNGENCY_METHOD,
      shareScope: enums.SHARE_SCOPE,
      sharePermission: enums.SHARE_PERMISSION,
    }),
  );

  // Every route resolves the viewer first; the read routes use it to scope
  // results, and requireAuth gates the rest.
  app.use('/api', optionalAuth);

  app.use('/api/auth', authRouter);
  app.use('/api/plants', plantsRouter);
  app.use('/api/pollinations', pollinationsRouter);
  app.use('/api/pods', podsRouter);
  app.use('/api/shares', sharesRouter);
  app.use('/api/members', membersRouter);
  app.use('/api/dashboard', dashboardRouter);

  // Serve the built React app from the same origin as the API. Mounted after
  // the routers so /api always wins, and before notFoundHandler so an unknown
  // /api path still gets a JSON 404 rather than the HTML shell.
  if (config.serveWeb) {
    if (!existsSync(join(config.webDistPath, 'index.html'))) {
      throw new Error(
        `SERVE_WEB is on but no build was found at ${config.webDistPath}. ` +
          'Run `npm run build` first, or set SERVE_WEB=false to run the API alone.',
      );
    }

    app.use(express.static(config.webDistPath, { index: false, maxAge: '1h' }));

    // Client-side routing: a deep link like /plants/<id> is not a file on
    // disk, so hand any other GET back to the app shell and let React Router
    // resolve it.
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
      res.sendFile(join(config.webDistPath, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
