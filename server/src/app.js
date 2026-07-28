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

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
