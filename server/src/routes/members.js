import { Router } from 'express';
import { query } from '../db/pool.js';
import { ApiError, asyncHandler } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { serializeMember } from '../services/serialize.js';
import { validateQuery, z } from '../lib/validate.js';

export const membersRouter = Router();

/**
 * Member directory, used to pick who to share lineage with. Only breeders who
 * have left themselves discoverable appear here.
 */
membersRouter.get(
  '/',
  requireAuth,
  validateQuery(
    z.object({
      q: z.string().trim().max(60).optional(),
      limit: z.coerce.number().int().min(1).max(50).default(20),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { q, limit } = req.validatedQuery;
    const params = [req.user.id, limit];
    let filter = '';

    if (q) {
      params.splice(1, 0, `%${q}%`);
      filter = 'AND (u.handle ILIKE $2 OR u.display_name ILIKE $2 OR u.program_name ILIKE $2)';
    }

    const { rows } = await query(
      `SELECT u.id, u.handle, u.display_name, u.program_name, u.bio
         FROM users u
        WHERE u.discoverable = true
          AND u.id <> $1
          ${filter}
        ORDER BY u.display_name
        LIMIT $${params.length}`,
      params,
    );

    res.json({ members: rows.map(serializeMember) });
  }),
);

/** Public-facing profile for one breeder, with the plants this viewer may see. */
membersRouter.get(
  '/:handle',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      'SELECT id, handle, display_name, program_name, bio, discoverable FROM users WHERE handle = $1',
      [req.params.handle.toLowerCase()],
    );
    if (rows.length === 0) throw ApiError.notFound('No member with that handle');

    const member = rows[0];
    // An undiscoverable breeder is still reachable by anyone they have
    // actually shared with, or by themselves.
    if (!member.discoverable && req.user?.id !== member.id) {
      const { rows: shared } = await query(
        `SELECT 1 FROM lineage_shares
          WHERE owner_id = $1 AND grantee_id = $2 AND revoked_at IS NULL
            AND (expires_at IS NULL OR expires_at > now()) LIMIT 1`,
        [member.id, req.user?.id ?? null],
      );
      if (shared.length === 0) throw ApiError.notFound('No member with that handle');
    }

    const { rows: plants } = await query(
      `SELECT p.id, p.name, p.accession_code, p.species, p.generation, p.visibility
         FROM plants p
        WHERE p.owner_id = $1
          AND p.id IN (SELECT plant_id FROM accessible_plant_ids($2))
        ORDER BY p.created_at DESC
        LIMIT 100`,
      [member.id, req.user?.id ?? null],
    );

    res.json({
      member: serializeMember(member),
      plants: plants.map((p) => ({
        id: p.id,
        name: p.name,
        accessionCode: p.accession_code,
        species: p.species,
        generation: p.generation,
        visibility: p.visibility,
      })),
    });
  }),
);
