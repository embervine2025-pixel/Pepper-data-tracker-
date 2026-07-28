import { Router } from 'express';
import { query } from '../db/pool.js';
import { asyncHandler } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { camelize } from '../services/serialize.js';

export const dashboardRouter = Router();

/** Everything the landing screen needs, in one round trip. */
dashboardRouter.get(
  '/summary',
  requireAuth,
  asyncHandler(async (req, res) => {
    const viewerId = req.user.id;

    const [counts, species, recentPlants, activeCrosses, hottest, shares] = await Promise.all([
      query(
        `SELECT
           (SELECT COUNT(*) FROM plants WHERE owner_id = $1)                       AS plants,
           (SELECT COUNT(*) FROM plants WHERE owner_id = $1 AND status = 'active') AS active_plants,
           (SELECT COUNT(*) FROM pollinations WHERE breeder_id = $1)               AS crosses,
           (SELECT COUNT(*) FROM pollinations WHERE breeder_id = $1 AND outcome = 'pending') AS pending_crosses,
           (SELECT COUNT(*) FROM pods WHERE recorded_by = $1)                      AS pods,
           (SELECT COUNT(*) FROM lineage_shares
             WHERE owner_id = $1 AND revoked_at IS NULL
               AND (expires_at IS NULL OR expires_at > now()))                     AS shares_granted,
           (SELECT COUNT(*) FROM lineage_shares
             WHERE grantee_id = $1 AND revoked_at IS NULL
               AND (expires_at IS NULL OR expires_at > now()))                     AS shares_received`,
        [viewerId],
      ),
      query(
        `SELECT species, COUNT(*) AS count
           FROM plants WHERE owner_id = $1
          GROUP BY species ORDER BY count DESC`,
        [viewerId],
      ),
      query(
        `SELECT p.id, p.name, p.accession_code, p.species, p.generation, p.visibility, p.created_at,
                (SELECT COUNT(*) FROM pods d WHERE d.plant_id = p.id) AS pod_count
           FROM plants p WHERE p.owner_id = $1
          ORDER BY p.created_at DESC LIMIT 6`,
        [viewerId],
      ),
      query(
        `SELECT x.id, x.pollination_date, x.method, x.outcome, x.target_trait,
                m.name AS mother_name, f.name AS father_name
           FROM pollinations x
           JOIN plants m ON m.id = x.mother_plant_id
           LEFT JOIN plants f ON f.id = x.father_plant_id
          WHERE x.breeder_id = $1
          ORDER BY x.pollination_date DESC LIMIT 6`,
        [viewerId],
      ),
      query(
        `SELECT d.id, d.pungency_shu, d.pungency_measure, d.colour_mature, d.shape,
                p.id AS plant_id, p.name AS plant_name
           FROM pods d JOIN plants p ON p.id = d.plant_id
          WHERE p.owner_id = $1 AND d.pungency_shu IS NOT NULL
          ORDER BY d.pungency_shu DESC LIMIT 5`,
        [viewerId],
      ),
      query(
        `SELECT s.id, s.scope, s.permission, s.expires_at,
                g.handle AS grantee_handle, g.display_name AS grantee_display_name,
                pl.name AS plant_name
           FROM lineage_shares s
           JOIN users g ON g.id = s.grantee_id
           LEFT JOIN plants pl ON pl.id = s.plant_id
          WHERE s.owner_id = $1 AND s.revoked_at IS NULL
            AND (s.expires_at IS NULL OR s.expires_at > now())
          ORDER BY s.created_at DESC LIMIT 5`,
        [viewerId],
      ),
    ]);

    res.json({
      counts: camelize(counts.rows[0]),
      speciesBreakdown: species.rows.map((r) => ({ species: r.species, count: Number(r.count) })),
      recentPlants: camelize(recentPlants.rows),
      recentCrosses: camelize(activeCrosses.rows),
      hottestPods: camelize(hottest.rows),
      activeShares: camelize(shares.rows),
    });
  }),
);
