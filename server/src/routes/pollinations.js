import { Router } from 'express';
import { query } from '../db/pool.js';
import { ApiError, asyncHandler } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { buildUpdate } from '../lib/sql.js';
import { assertCanContribute, canViewPlant } from '../services/access.js';
import { camelize, serializePlant } from '../services/serialize.js';
import {
  validateBody,
  validateQuery,
  z,
  uuid,
  optionalText,
  optionalDate,
  optionalInt,
  isoDate,
} from '../lib/validate.js';
import { POLLINATION_METHOD, POLLINATION_OUTCOME, CAPSICUM_SPECIES, PLANT_STATUS, PLANT_VISIBILITY } from '../lib/enums.js';

export const pollinationsRouter = Router();

// A pollination is readable when its seed (mother) parent is readable.
const VISIBLE = 'x.mother_plant_id IN (SELECT plant_id FROM accessible_plant_ids($1))';

const POLLINATION_SELECT = `
  x.*,
  m.name           AS mother_name,
  m.accession_code AS mother_accession_code,
  f.name           AS father_name,
  f.accession_code AS father_accession_code,
  u.handle         AS breeder_handle,
  u.display_name   AS breeder_display_name,
  (SELECT COUNT(*) FROM pods pd WHERE pd.pollination_id = x.id) AS pod_count,
  (SELECT COUNT(*) FROM plants pl WHERE pl.origin_pollination_id = x.id) AS offspring_count
`;

const POLLINATION_FROM = `
  FROM pollinations x
  JOIN plants m ON m.id = x.mother_plant_id
  LEFT JOIN plants f ON f.id = x.father_plant_id
  JOIN users u ON u.id = x.breeder_id
`;

function serializePollination(row) {
  const {
    mother_name,
    mother_accession_code,
    father_name,
    father_accession_code,
    breeder_handle,
    breeder_display_name,
    ...rest
  } = row;

  return {
    ...camelize(rest),
    mother: { id: row.mother_plant_id, name: mother_name, accessionCode: mother_accession_code },
    father: row.father_plant_id
      ? { id: row.father_plant_id, name: father_name, accessionCode: father_accession_code }
      : null,
    breeder: { id: row.breeder_id, handle: breeder_handle, displayName: breeder_display_name },
  };
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

const listSchema = z.object({
  plantId: uuid.optional(),
  outcome: z.enum(POLLINATION_OUTCOME).optional(),
  method: z.enum(POLLINATION_METHOD).optional(),
  mine: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

pollinationsRouter.get(
  '/',
  validateQuery(listSchema),
  asyncHandler(async (req, res) => {
    const f = req.validatedQuery;
    const params = [req.user?.id ?? null];
    const where = [VISIBLE];

    if (f.plantId) {
      params.push(f.plantId);
      // Either side of the cross matches, so a plant's page shows the crosses
      // it was the pollen donor for as well.
      where.push(`(x.mother_plant_id = $${params.length} OR x.father_plant_id = $${params.length})`);
    }
    if (f.outcome) {
      params.push(f.outcome);
      where.push(`x.outcome = $${params.length}`);
    }
    if (f.method) {
      params.push(f.method);
      where.push(`x.method = $${params.length}`);
    }
    if (f.mine === 'true') {
      if (!req.user) throw ApiError.unauthorized();
      params.push(req.user.id);
      where.push(`x.breeder_id = $${params.length}`);
    }

    params.push(f.limit, f.offset);
    const { rows } = await query(
      `SELECT ${POLLINATION_SELECT}, COUNT(*) OVER() AS total_count
       ${POLLINATION_FROM}
       WHERE ${where.join(' AND ')}
       ORDER BY x.pollination_date DESC, x.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    res.json({
      pollinations: rows.map(({ total_count, ...row }) => serializePollination(row)),
      pagination: {
        total: rows.length > 0 ? Number(rows[0].total_count) : 0,
        limit: f.limit,
        offset: f.offset,
      },
    });
  }),
);

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

const pollinationFields = {
  motherPlantId: 'mother_plant_id',
  fatherPlantId: 'father_plant_id',
  method: 'method',
  pollinationDate: 'pollination_date',
  isolationMethod: 'isolation_method',
  flowersPollinated: 'flowers_pollinated',
  podsSet: 'pods_set',
  outcome: 'outcome',
  harvestDate: 'harvest_date',
  seedsHarvested: 'seeds_harvested',
  targetTrait: 'target_trait',
  notes: 'notes',
};

const createSchema = z
  .object({
    motherPlantId: uuid,
    fatherPlantId: uuid.nullish(),
    method: z.enum(POLLINATION_METHOD),
    pollinationDate: isoDate,
    isolationMethod: optionalText(120),
    flowersPollinated: z.coerce.number().int().min(1).max(10000).default(1),
    podsSet: optionalInt(0, 10000),
    outcome: z.enum(POLLINATION_OUTCOME).default('pending'),
    harvestDate: optionalDate,
    seedsHarvested: optionalInt(0, 100000),
    targetTrait: optionalText(300),
    notes: optionalText(5000),
  })
  // Mirrors the CHECK constraints so the client gets a field-level message
  // instead of a raw constraint violation.
  .refine((v) => v.method !== 'open_pollination' || !v.fatherPlantId, {
    message: 'Open pollination has no recorded pollen parent',
    path: ['fatherPlantId'],
  })
  .refine((v) => v.method !== 'bagged_self' || v.fatherPlantId === v.motherPlantId, {
    message: 'A bagged self must name the same plant as both parents',
    path: ['fatherPlantId'],
  })
  .refine((v) => v.podsSet == null || v.podsSet <= v.flowersPollinated, {
    message: 'Cannot exceed the number of flowers pollinated',
    path: ['podsSet'],
  });

pollinationsRouter.post(
  '/',
  requireAuth,
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    const body = req.body;
    // Recording a cross writes to the mother's record, so it needs contribute
    // rights there; the pollen parent only needs to be visible.
    await assertCanContribute(req.user.id, body.motherPlantId);
    if (body.fatherPlantId && body.fatherPlantId !== body.motherPlantId) {
      if (!(await canViewPlant(req.user.id, body.fatherPlantId))) {
        throw ApiError.badRequest('The pollen parent does not exist or is not visible to you');
      }
    }

    const columns = Object.keys(pollinationFields);
    const values = columns.map((field) => body[field] ?? null);

    const { rows } = await query(
      `INSERT INTO pollinations (breeder_id, ${columns.map((c) => pollinationFields[c]).join(', ')})
       VALUES ($1, ${columns.map((_, i) => `$${i + 2}`).join(', ')})
       RETURNING id`,
      [req.user.id, ...values],
    );

    const { rows: full } = await query(
      `SELECT ${POLLINATION_SELECT} ${POLLINATION_FROM} WHERE x.id = $1`,
      [rows[0].id],
    );
    res.status(201).json({ pollination: serializePollination(full[0]) });
  }),
);

// ---------------------------------------------------------------------------
// Read / update / delete
// ---------------------------------------------------------------------------

async function loadVisible(req) {
  const { rows } = await query(
    `SELECT ${POLLINATION_SELECT} ${POLLINATION_FROM} WHERE x.id = $2 AND ${VISIBLE}`,
    [req.user?.id ?? null, req.params.id],
  );
  if (rows.length === 0) throw ApiError.notFound('Pollination record not found');
  return rows[0];
}

pollinationsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const row = await loadVisible(req);
    res.json({
      pollination: serializePollination(row),
      canEdit: req.user?.id === row.breeder_id,
    });
  }),
);

const updateSchema = z.object({
  method: z.enum(POLLINATION_METHOD).optional(),
  pollinationDate: isoDate.optional(),
  isolationMethod: optionalText(120),
  flowersPollinated: z.coerce.number().int().min(1).max(10000).optional(),
  podsSet: optionalInt(0, 10000),
  outcome: z.enum(POLLINATION_OUTCOME).optional(),
  harvestDate: optionalDate,
  seedsHarvested: optionalInt(0, 100000),
  targetTrait: optionalText(300),
  notes: optionalText(5000),
});

pollinationsRouter.patch(
  '/:id',
  requireAuth,
  validateBody(updateSchema),
  asyncHandler(async (req, res) => {
    const existing = await loadVisible(req);
    if (existing.breeder_id !== req.user.id) {
      throw ApiError.forbidden('Only the breeder who recorded this cross can edit it');
    }

    const { text: sql, values } = buildUpdate('pollinations', pollinationFields, req.body, {
      where: 'id = $1',
      whereParams: [req.params.id],
    });
    await query(sql, values);

    const { rows } = await query(
      `SELECT ${POLLINATION_SELECT} ${POLLINATION_FROM} WHERE x.id = $1`,
      [req.params.id],
    );
    res.json({ pollination: serializePollination(rows[0]) });
  }),
);

pollinationsRouter.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const existing = await loadVisible(req);
    if (existing.breeder_id !== req.user.id) {
      throw ApiError.forbidden('Only the breeder who recorded this cross can delete it');
    }
    await query('DELETE FROM pollinations WHERE id = $1', [req.params.id]);
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------------------
// Grow-out: turn a cross into the next generation
// ---------------------------------------------------------------------------

const offspringSchema = z.object({
  accessionCode: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(160),
  species: z.enum(CAPSICUM_SPECIES).optional(),
  generation: optionalText(16),
  generationNumber: optionalInt(0, 100),
  sowDate: optionalDate,
  status: z.enum(PLANT_STATUS).default('active'),
  visibility: z.enum(PLANT_VISIBILITY).optional(),
  notes: optionalText(5000),
});

/**
 * Creates a seedling plant already wired to both parents and to the cross it
 * came from -- the step breeders take every time they sow out a cross, and
 * the one most likely to be mis-recorded if done by hand.
 */
pollinationsRouter.post(
  '/:id/offspring',
  requireAuth,
  validateBody(offspringSchema),
  asyncHandler(async (req, res) => {
    const cross = await loadVisible(req);
    await assertCanContribute(req.user.id, cross.mother_plant_id);

    const { rows: motherRows } = await query(
      'SELECT species, generation_number FROM plants WHERE id = $1',
      [cross.mother_plant_id],
    );
    const mother = motherRows[0];

    // Default the filial rank to one past the seed parent's.
    const generationNumber =
      req.body.generationNumber ??
      (mother.generation_number != null ? mother.generation_number + 1 : null);
    const generation =
      req.body.generation ?? (generationNumber != null ? `F${generationNumber}` : null);

    const { rows } = await query(
      `INSERT INTO plants (
         owner_id, accession_code, name, species, generation, generation_number,
         mother_plant_id, father_plant_id, origin_pollination_id,
         sow_date, status, visibility, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        req.user.id,
        req.body.accessionCode,
        req.body.name,
        req.body.species ?? mother.species,
        generation,
        generationNumber,
        cross.mother_plant_id,
        cross.father_plant_id,
        cross.id,
        req.body.sowDate,
        req.body.status,
        req.body.visibility ?? req.user.default_visibility,
        req.body.notes,
      ],
    );

    res.status(201).json({ plant: serializePlant(rows[0]) });
  }),
);
