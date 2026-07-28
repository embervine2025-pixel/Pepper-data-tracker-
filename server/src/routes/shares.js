import { Router } from 'express';
import { query } from '../db/pool.js';
import { ApiError, asyncHandler } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { camelize } from '../services/serialize.js';
import { validateBody, validateQuery, z, uuid, optionalText } from '../lib/validate.js';
import { SHARE_SCOPE, SHARE_PERMISSION } from '../lib/enums.js';

export const sharesRouter = Router();

/**
 * Selective lineage sharing. A share is always a grant from the signed-in
 * breeder to one named member, and it is revocable at any time -- revoking
 * soft-deletes so the record of who once had access survives.
 */

const SHARE_SELECT = `
  s.*,
  owner.handle         AS owner_handle,
  owner.display_name   AS owner_display_name,
  grantee.handle       AS grantee_handle,
  grantee.display_name AS grantee_display_name,
  grantee.program_name AS grantee_program_name,
  pl.name              AS plant_name,
  pl.accession_code    AS plant_accession_code,
  (s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at > now())) AS is_active
`;

const SHARE_FROM = `
  FROM lineage_shares s
  JOIN users owner   ON owner.id = s.owner_id
  JOIN users grantee ON grantee.id = s.grantee_id
  LEFT JOIN plants pl ON pl.id = s.plant_id
`;

function serializeShare(row) {
  const {
    owner_handle,
    owner_display_name,
    grantee_handle,
    grantee_display_name,
    grantee_program_name,
    plant_name,
    plant_accession_code,
    ...rest
  } = row;

  return {
    ...camelize(rest),
    owner: { id: row.owner_id, handle: owner_handle, displayName: owner_display_name },
    grantee: {
      id: row.grantee_id,
      handle: grantee_handle,
      displayName: grantee_display_name,
      programName: grantee_program_name ?? null,
    },
    plant: row.plant_id
      ? { id: row.plant_id, name: plant_name, accessionCode: plant_accession_code }
      : null,
  };
}

const listSchema = z.object({
  includeRevoked: z.enum(['true', 'false']).default('false'),
});

/** Shares this breeder has handed out. */
sharesRouter.get(
  '/granted',
  requireAuth,
  validateQuery(listSchema),
  asyncHandler(async (req, res) => {
    const activeOnly = req.validatedQuery.includeRevoked !== 'true';
    const { rows } = await query(
      `SELECT ${SHARE_SELECT} ${SHARE_FROM}
        WHERE s.owner_id = $1 ${activeOnly ? 'AND s.revoked_at IS NULL' : ''}
        ORDER BY s.created_at DESC`,
      [req.user.id],
    );
    res.json({ shares: rows.map(serializeShare) });
  }),
);

/** Shares other breeders have handed to this one. */
sharesRouter.get(
  '/received',
  requireAuth,
  validateQuery(listSchema),
  asyncHandler(async (req, res) => {
    const activeOnly = req.validatedQuery.includeRevoked !== 'true';
    const { rows } = await query(
      `SELECT ${SHARE_SELECT} ${SHARE_FROM}
        WHERE s.grantee_id = $1 ${activeOnly ? 'AND s.revoked_at IS NULL' : ''}
        ORDER BY s.created_at DESC`,
      [req.user.id],
    );
    res.json({ shares: rows.map(serializeShare) });
  }),
);

const createSchema = z
  .object({
    // Either identifier works; handle is what a breeder actually knows.
    granteeId: uuid.optional(),
    granteeHandle: z.string().trim().toLowerCase().max(32).optional(),
    scope: z.enum(SHARE_SCOPE),
    plantId: uuid.optional(),
    permission: z.enum(SHARE_PERMISSION).default('view'),
    includeAncestors: z.boolean().default(true),
    includeDescendants: z.boolean().default(false),
    note: optionalText(500),
    expiresAt: z
      .union([z.string().datetime({ offset: true }), z.null()])
      .optional()
      .transform((v) => v ?? null),
  })
  .refine((v) => v.granteeId || v.granteeHandle, {
    message: 'Name the member to share with',
    path: ['granteeHandle'],
  })
  .refine((v) => v.scope !== 'plant' || v.plantId, {
    message: 'A plant-scoped share must name a plant',
    path: ['plantId'],
  })
  .refine((v) => v.scope !== 'collection' || !v.plantId, {
    message: 'A collection-scoped share covers every plant, so it takes no plant id',
    path: ['plantId'],
  });

sharesRouter.post(
  '/',
  requireAuth,
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    const body = req.body;

    const { rows: granteeRows } = await query(
      'SELECT id FROM users WHERE ($1::uuid IS NOT NULL AND id = $1) OR ($2::citext IS NOT NULL AND handle = $2)',
      [body.granteeId ?? null, body.granteeHandle ?? null],
    );
    if (granteeRows.length === 0) throw ApiError.notFound('No member with that handle');
    const granteeId = granteeRows[0].id;
    if (granteeId === req.user.id) {
      throw ApiError.badRequest('You already have access to your own plants');
    }

    // You can only share a plant you own -- sharing one you merely have
    // access to would let a grant be laundered onwards.
    if (body.scope === 'plant') {
      const { rows } = await query('SELECT owner_id FROM plants WHERE id = $1', [body.plantId]);
      if (rows.length === 0) throw ApiError.notFound('Plant not found');
      if (rows[0].owner_id !== req.user.id) {
        throw ApiError.forbidden('You can only share plants you own');
      }
    }

    const { rows } = await query(
      `INSERT INTO lineage_shares
         (owner_id, grantee_id, scope, plant_id, permission,
          include_ancestors, include_descendants, note, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [
        req.user.id,
        granteeId,
        body.scope,
        body.plantId ?? null,
        body.permission,
        body.includeAncestors,
        body.includeDescendants,
        body.note,
        body.expiresAt,
      ],
    );

    const { rows: full } = await query(`SELECT ${SHARE_SELECT} ${SHARE_FROM} WHERE s.id = $1`, [
      rows[0].id,
    ]);
    res.status(201).json({ share: serializeShare(full[0]) });
  }),
);

const updateSchema = z.object({
  permission: z.enum(SHARE_PERMISSION).optional(),
  includeAncestors: z.boolean().optional(),
  includeDescendants: z.boolean().optional(),
  note: optionalText(500),
  expiresAt: z
    .union([z.string().datetime({ offset: true }), z.null()])
    .optional(),
});

sharesRouter.patch(
  '/:id',
  requireAuth,
  validateBody(updateSchema),
  asyncHandler(async (req, res) => {
    const { rows: existing } = await query(
      'SELECT owner_id, revoked_at FROM lineage_shares WHERE id = $1',
      [req.params.id],
    );
    if (existing.length === 0) throw ApiError.notFound('Share not found');
    if (existing[0].owner_id !== req.user.id) {
      throw ApiError.forbidden('Only the granting breeder can change this share');
    }
    if (existing[0].revoked_at) {
      throw ApiError.conflict('This share has been revoked; create a new one instead');
    }

    const b = req.body;
    const { rows } = await query(
      `UPDATE lineage_shares SET
         permission          = COALESCE($2, permission),
         include_ancestors   = COALESCE($3, include_ancestors),
         include_descendants = COALESCE($4, include_descendants),
         note                = CASE WHEN $5::boolean THEN $6 ELSE note END,
         expires_at          = CASE WHEN $7::boolean THEN $8::timestamptz ELSE expires_at END
       WHERE id = $1
       RETURNING id`,
      [
        req.params.id,
        b.permission ?? null,
        b.includeAncestors ?? null,
        b.includeDescendants ?? null,
        'note' in b,
        b.note ?? null,
        'expiresAt' in b,
        b.expiresAt ?? null,
      ],
    );

    const { rows: full } = await query(`SELECT ${SHARE_SELECT} ${SHARE_FROM} WHERE s.id = $1`, [
      rows[0].id,
    ]);
    res.json({ share: serializeShare(full[0]) });
  }),
);

/** Revoke. Soft-delete keeps the audit trail of who once had access. */
sharesRouter.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `UPDATE lineage_shares SET revoked_at = now()
        WHERE id = $1 AND owner_id = $2 AND revoked_at IS NULL
        RETURNING id`,
      [req.params.id, req.user.id],
    );
    if (rows.length === 0) {
      throw ApiError.notFound('No active share with that id that you granted');
    }
    res.status(204).end();
  }),
);

/**
 * Who can currently see a given plant, and why. This is the answer to the
 * question a breeder actually asks before publishing anything.
 */
sharesRouter.get(
  '/audience/:plantId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows: plantRows } = await query(
      'SELECT id, name, visibility, owner_id FROM plants WHERE id = $1',
      [req.params.plantId],
    );
    if (plantRows.length === 0) throw ApiError.notFound('Plant not found');
    if (plantRows[0].owner_id !== req.user.id) {
      throw ApiError.forbidden('Only the owning breeder can see a plant’s audience');
    }

    const { rows } = await query(
      `SELECT DISTINCT
         g.id, g.handle, g.display_name, g.program_name,
         s.scope, s.permission, s.expires_at, s.include_ancestors, s.include_descendants
       FROM lineage_shares s
       JOIN users g ON g.id = s.grantee_id
       WHERE s.owner_id = $1
         AND s.revoked_at IS NULL
         AND (s.expires_at IS NULL OR s.expires_at > now())
         AND (
           s.scope = 'collection'
           OR s.plant_id = $2
           -- plant-scoped grants that reach this plant along the lineage
           OR (s.include_ancestors AND $2 IN (
                 WITH RECURSIVE up AS (
                   SELECT id, mother_plant_id, father_plant_id FROM plants WHERE id = s.plant_id
                   UNION
                   SELECT p.id, p.mother_plant_id, p.father_plant_id
                   FROM up JOIN plants p ON p.id IN (up.mother_plant_id, up.father_plant_id)
                 ) SELECT id FROM up))
           OR (s.include_descendants AND $2 IN (
                 WITH RECURSIVE down AS (
                   SELECT id FROM plants WHERE id = s.plant_id
                   UNION
                   SELECT p.id FROM down
                   JOIN plants p ON p.mother_plant_id = down.id OR p.father_plant_id = down.id
                 ) SELECT id FROM down))
         )
       ORDER BY g.display_name`,
      [req.user.id, req.params.plantId],
    );

    res.json({
      plant: {
        id: plantRows[0].id,
        name: plantRows[0].name,
        visibility: plantRows[0].visibility,
      },
      audience: rows.map((r) => ({
        member: {
          id: r.id,
          handle: r.handle,
          displayName: r.display_name,
          programName: r.program_name ?? null,
        },
        via: r.scope,
        permission: r.permission,
        expiresAt: r.expires_at,
        includeAncestors: r.include_ancestors,
        includeDescendants: r.include_descendants,
      })),
    });
  }),
);
