import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { query } from '../db/pool.js';
import { config } from '../config.js';
import { ApiError, asyncHandler } from '../lib/errors.js';
import { signToken, requireAuth } from '../middleware/auth.js';
import { serializeUser } from '../services/serialize.js';
import { validateBody, z, text, optionalText } from '../lib/validate.js';

export const authRouter = Router();

// Credential endpoints are the obvious brute-force target; everything else is
// covered by the global limiter in app.js.
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.isTest ? 10_000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many attempts, try again in a few minutes' } },
});

const handleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9][a-z0-9_-]{2,31}$/,
    'must be 3-32 characters: letters, numbers, hyphen or underscore',
  );

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email('must be a valid email address'),
  handle: handleSchema,
  password: z
    .string()
    .min(10, 'must be at least 10 characters')
    .max(200, 'must be at most 200 characters'),
  displayName: text(120),
  programName: optionalText(160),
  bio: optionalText(2000),
});

authRouter.post(
  '/register',
  credentialLimiter,
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const { email, handle, password, displayName, programName, bio } = req.body;

    const existing = await query(
      'SELECT email, handle FROM users WHERE email = $1 OR handle = $2',
      [email, handle],
    );
    if (existing.rows.length > 0) {
      const clash = existing.rows[0];
      throw ApiError.conflict(
        clash.email.toLowerCase() === email ? 'That email is already registered' : 'That handle is taken',
      );
    }

    const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
    const { rows } = await query(
      `INSERT INTO users (email, handle, password_hash, display_name, program_name, bio)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [email, handle, passwordHash, displayName, programName, bio],
    );

    const user = rows[0];
    res.status(201).json({ token: signToken(user), user: serializeUser(user) });
  }),
);

const loginSchema = z.object({
  email: z.string().trim().toLowerCase(),
  password: z.string(),
});

authRouter.post(
  '/login',
  credentialLimiter,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];

    // Hash even when the account is missing, so response timing does not
    // reveal which emails are registered.
    const hash = user?.password_hash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvaliduO';
    const ok = await bcrypt.compare(password, hash);

    if (!user || !ok) throw ApiError.unauthorized('Incorrect email or password');

    res.json({ token: signToken(user), user: serializeUser(user) });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: serializeUser(req.user) });
  }),
);

const updateMeSchema = z.object({
  displayName: text(120).optional(),
  programName: optionalText(160),
  bio: optionalText(2000),
  defaultVisibility: z.enum(['private', 'community', 'public']).optional(),
  discoverable: z.boolean().optional(),
});

authRouter.patch(
  '/me',
  requireAuth,
  validateBody(updateMeSchema),
  asyncHandler(async (req, res) => {
    const { displayName, programName, bio, defaultVisibility, discoverable } = req.body;
    const { rows } = await query(
      `UPDATE users SET
         display_name       = COALESCE($2, display_name),
         program_name       = CASE WHEN $3::boolean THEN $4 ELSE program_name END,
         bio                = CASE WHEN $5::boolean THEN $6 ELSE bio END,
         default_visibility = COALESCE($7, default_visibility),
         discoverable       = COALESCE($8, discoverable)
       WHERE id = $1
       RETURNING *`,
      [
        req.user.id,
        displayName ?? null,
        'programName' in req.body,
        programName ?? null,
        'bio' in req.body,
        bio ?? null,
        defaultVisibility ?? null,
        discoverable ?? null,
      ],
    );
    res.json({ user: serializeUser(rows[0]) });
  }),
);

const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(10, 'must be at least 10 characters').max(200),
});

authRouter.post(
  '/change-password',
  requireAuth,
  credentialLimiter,
  validateBody(changePasswordSchema),
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const ok = await bcrypt.compare(req.body.currentPassword, rows[0].password_hash);
    if (!ok) throw ApiError.unauthorized('Current password is incorrect');

    const hash = await bcrypt.hash(req.body.newPassword, config.bcryptRounds);
    await query('UPDATE users SET password_hash = $2 WHERE id = $1', [req.user.id, hash]);
    res.json({ ok: true });
  }),
);
