import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { ApiError } from '../lib/errors.js';
import { query } from '../db/pool.js';

export function signToken(user) {
  return jwt.sign({ sub: user.id, handle: user.handle }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

function readBearer(req) {
  const header = req.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}

/**
 * Populates req.user when a valid token is present, and leaves it null
 * otherwise. Public/community read routes mount this so an anonymous request
 * still resolves to the public slice of the data.
 */
export async function optionalAuth(req, res, next) {
  const token = readBearer(req);
  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const { rows } = await query(
      'SELECT id, email, handle, display_name, program_name, bio, default_visibility, discoverable, created_at FROM users WHERE id = $1',
      [payload.sub],
    );
    // Token still signed correctly but the account is gone: treat as anonymous.
    req.user = rows[0] ?? null;
    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(ApiError.unauthorized('Session expired, please sign in again'));
    }
    if (err.name === 'JsonWebTokenError') {
      return next(ApiError.unauthorized('Invalid session token'));
    }
    return next(err);
  }
}

/** Requires a signed-in user. Mount after optionalAuth. */
export function requireAuth(req, res, next) {
  if (!req.user) return next(ApiError.unauthorized());
  return next();
}
