import { ZodError } from 'zod';
import { ApiError } from '../lib/errors.js';
import { config } from '../config.js';

// PostgreSQL error codes we can turn into a meaningful client response.
const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_CHECK_VIOLATION = '23514';
const PG_INVALID_TEXT_REPRESENTATION = '22P02';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { message: `No route for ${req.method} ${req.path}` } });
}

// eslint-disable-next-line no-unused-vars -- Express identifies error middleware by arity
export function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: { message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        message: 'Validation failed',
        details: err.issues.map((issue) => ({
          field: issue.path.join('.') || '(body)',
          message: issue.message,
        })),
      },
    });
  }

  switch (err.code) {
    case PG_UNIQUE_VIOLATION:
      return res.status(409).json({
        error: {
          message: 'That record already exists',
          details: err.detail ? [{ field: err.constraint ?? 'unknown', message: err.detail }] : undefined,
        },
      });
    case PG_FOREIGN_KEY_VIOLATION:
      return res.status(400).json({
        error: { message: 'Referenced record does not exist', details: [{ field: err.constraint ?? 'unknown', message: err.detail ?? '' }] },
      });
    case PG_CHECK_VIOLATION:
      return res.status(400).json({
        error: { message: `Record violates the constraint "${err.constraint ?? 'unknown'}"`, details: err.message ? [{ field: err.constraint ?? 'unknown', message: err.message }] : undefined },
      });
    case PG_INVALID_TEXT_REPRESENTATION:
      return res.status(400).json({ error: { message: 'Malformed value in request' } });
    default:
      break;
  }

  console.error('[error]', err);
  res.status(500).json({
    error: {
      message: 'Internal server error',
      ...(config.isProduction ? {} : { debug: err.message }),
    },
  });
}
