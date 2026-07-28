import { z } from 'zod';

/** Parses req.body / req.query with a zod schema, replacing it with the result. */
export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) return next(result.error);
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query ?? {});
    if (!result.success) return next(result.error);
    // req.query is a getter-only property on Express 5 style requests; keep the
    // parsed copy alongside it rather than assigning over it.
    req.validatedQuery = result.data;
    next();
  };
}

export const uuid = z.string().uuid('must be a UUID');

/** Trimmed, non-empty string with a max length. */
export const text = (max) =>
  z.string().trim().min(1, 'must not be empty').max(max, `must be at most ${max} characters`);

/** Optional free text: '' and null both normalise to null so the DB stays clean. */
export const optionalText = (max) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === null) return null;
      const trimmed = v.trim();
      return trimmed === '' ? null : trimmed;
    })
    .refine((v) => v === null || v.length <= max, `must be at most ${max} characters`);

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a YYYY-MM-DD date')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'must be a real date');

export const optionalDate = z
  .union([isoDate, z.null()])
  .optional()
  .transform((v) => v ?? null);

export const optionalInt = (min, max) =>
  z
    .union([z.coerce.number().int().min(min).max(max), z.null()])
    .optional()
    .transform((v) => (v === undefined ? null : v));

export const optionalNumber = (min, max) =>
  z
    .union([z.coerce.number().min(min).max(max), z.null()])
    .optional()
    .transform((v) => (v === undefined ? null : v));

export const optionalEnum = (values) =>
  z
    .union([z.enum(values), z.null()])
    .optional()
    .transform((v) => (v === undefined ? null : v));

export const optionalBool = z.union([z.boolean(), z.null()]).optional();

export const pagination = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * Rejects a PATCH body that contains no recognised fields, which would
 * otherwise generate an UPDATE with an empty SET clause.
 */
export function requireAtLeastOneField(schema) {
  return schema.refine(
    (value) => Object.values(value).some((v) => v !== undefined),
    'Provide at least one field to update',
  );
}

export { z };
