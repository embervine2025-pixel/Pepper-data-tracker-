import { query } from '../db/pool.js';
import { ApiError } from '../lib/errors.js';

/**
 * All authorisation for plant data funnels through here so the rules live in
 * one place. The read rule itself is the SQL function `accessible_plant_ids`,
 * defined in migration 001.
 */

/** Reusable predicate for list queries. `$n` is the viewer id parameter. */
export const VISIBLE_PLANTS_PREDICATE = (paramIndex) =>
  `p.id IN (SELECT plant_id FROM accessible_plant_ids($${paramIndex}))`;

export async function canViewPlant(viewerId, plantId) {
  const { rows } = await query(
    'SELECT 1 FROM accessible_plant_ids($1) WHERE plant_id = $2',
    [viewerId ?? null, plantId],
  );
  return rows.length > 0;
}

/**
 * Read access. Throws 404 rather than 403 for plants the viewer cannot see:
 * a 403 would confirm the plant exists, which is itself private information.
 */
export async function assertCanViewPlant(viewerId, plantId) {
  if (!(await canViewPlant(viewerId, plantId))) {
    throw ApiError.notFound('Plant not found');
  }
}

/** Write access to the plant record itself -- owner only. */
export async function assertOwnsPlant(viewerId, plantId) {
  const { rows } = await query('SELECT owner_id FROM plants WHERE id = $1', [plantId]);
  if (rows.length === 0) throw ApiError.notFound('Plant not found');
  if (rows[0].owner_id !== viewerId) {
    // The viewer may legitimately be able to read it, so distinguish here.
    if (await canViewPlant(viewerId, plantId)) {
      throw ApiError.forbidden('Only the owning breeder can modify this plant');
    }
    throw ApiError.notFound('Plant not found');
  }
}

/**
 * Permission to attach observations (pods, pollinations) to a plant: the
 * owner, or a member holding a live 'contribute' grant.
 */
export async function assertCanContribute(viewerId, plantId) {
  const { rows } = await query(
    'SELECT 1 FROM writable_plant_ids($1) WHERE plant_id = $2',
    [viewerId ?? null, plantId],
  );
  if (rows.length === 0) {
    if (await canViewPlant(viewerId, plantId)) {
      throw ApiError.forbidden('You have view-only access to this plant');
    }
    throw ApiError.notFound('Plant not found');
  }
}

/** Filters a list of plant ids down to those the viewer may read. */
export async function filterVisiblePlantIds(viewerId, plantIds) {
  const ids = plantIds.filter(Boolean);
  if (ids.length === 0) return new Set();
  const { rows } = await query(
    'SELECT plant_id FROM accessible_plant_ids($1) WHERE plant_id = ANY($2::uuid[])',
    [viewerId ?? null, ids],
  );
  return new Set(rows.map((r) => r.plant_id));
}
