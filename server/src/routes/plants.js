import { Router } from 'express';
import { query } from '../db/pool.js';
import { ApiError, asyncHandler } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { buildUpdate } from '../lib/sql.js';
import {
  assertCanViewPlant,
  assertOwnsPlant,
  canViewPlant,
} from '../services/access.js';
import { buildLineageGraph, listAncestors } from '../services/lineage.js';
import { serializePlant } from '../services/serialize.js';
import {
  validateBody,
  validateQuery,
  z,
  uuid,
  text,
  optionalText,
  optionalDate,
  optionalInt,
  optionalNumber,
  optionalEnum,
} from '../lib/validate.js';
import {
  CAPSICUM_SPECIES,
  PLANT_VISIBILITY,
  PLANT_STATUS,
  GROWTH_HABIT,
} from '../lib/enums.js';

export const plantsRouter = Router();

const PLANT_SELECT = `
  p.*,
  u.handle       AS owner_handle,
  u.display_name AS owner_display_name,
  u.program_name AS owner_program_name,
  (SELECT COUNT(*) FROM pods pd WHERE pd.plant_id = p.id) AS pod_count,
  (SELECT COUNT(*) FROM plants c
    WHERE c.mother_plant_id = p.id OR c.father_plant_id = p.id) AS child_count
`;

/**
 * A plant may only name a parent the creator is allowed to see -- otherwise
 * lineage could be used to probe for plants the viewer has no access to.
 */
async function assertParentUsable(viewerId, parentId, label) {
  if (!parentId) return;
  if (!(await canViewPlant(viewerId, parentId))) {
    throw ApiError.badRequest(`The ${label} plant does not exist or is not visible to you`);
  }
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

const listQuerySchema = z.object({
  q: z.string().trim().max(160).optional(),
  species: z.enum(CAPSICUM_SPECIES).optional(),
  status: z.enum(PLANT_STATUS).optional(),
  visibility: z.enum(PLANT_VISIBILITY).optional(),
  generation: z.string().trim().max(16).optional(),
  ownerHandle: z.string().trim().toLowerCase().max(32).optional(),
  mine: z.enum(['true', 'false']).optional(),
  stabilized: z.enum(['true', 'false']).optional(),
  sort: z.enum(['recent', 'name', 'generation']).default('recent'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

plantsRouter.get(
  '/',
  validateQuery(listQuerySchema),
  asyncHandler(async (req, res) => {
    const f = req.validatedQuery;
    const viewerId = req.user?.id ?? null;

    const params = [viewerId];
    const where = ['p.id IN (SELECT plant_id FROM accessible_plant_ids($1))'];

    if (f.q) {
      params.push(`%${f.q}%`);
      where.push(`(p.name ILIKE $${params.length} OR p.accession_code ILIKE $${params.length})`);
    }
    if (f.species) {
      params.push(f.species);
      where.push(`p.species = $${params.length}`);
    }
    if (f.status) {
      params.push(f.status);
      where.push(`p.status = $${params.length}`);
    }
    if (f.visibility) {
      params.push(f.visibility);
      where.push(`p.visibility = $${params.length}`);
    }
    if (f.generation) {
      params.push(f.generation);
      where.push(`p.generation = $${params.length}`);
    }
    if (f.ownerHandle) {
      params.push(f.ownerHandle);
      where.push(`u.handle = $${params.length}`);
    }
    if (f.mine === 'true') {
      if (!req.user) throw ApiError.unauthorized();
      params.push(req.user.id);
      where.push(`p.owner_id = $${params.length}`);
    }
    if (f.stabilized) {
      params.push(f.stabilized === 'true');
      where.push(`p.is_stabilized = $${params.length}`);
    }

    const orderBy = {
      recent: 'p.created_at DESC',
      name: 'lower(p.name) ASC',
      generation: 'p.generation_number ASC NULLS LAST, lower(p.name) ASC',
    }[f.sort];

    params.push(f.limit, f.offset);

    const { rows } = await query(
      `SELECT ${PLANT_SELECT}, COUNT(*) OVER() AS total_count
       FROM plants p
       JOIN users u ON u.id = p.owner_id
       WHERE ${where.join(' AND ')}
       ORDER BY ${orderBy}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    const total = rows.length > 0 ? Number(rows[0].total_count) : 0;
    res.json({
      plants: rows.map(({ total_count, ...row }) => serializePlant(row)),
      pagination: { total, limit: f.limit, offset: f.offset },
    });
  }),
);

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

const plantFields = {
  accessionCode: 'accession_code',
  name: 'name',
  species: 'species',
  generation: 'generation',
  generationNumber: 'generation_number',
  isStabilized: 'is_stabilized',
  motherPlantId: 'mother_plant_id',
  fatherPlantId: 'father_plant_id',
  originPollinationId: 'origin_pollination_id',
  seedSource: 'seed_source',
  seedLot: 'seed_lot',
  sowDate: 'sow_date',
  transplantDate: 'transplant_date',
  firstFlowerDate: 'first_flower_date',
  firstRipeDate: 'first_ripe_date',
  plantHeightCm: 'plant_height_cm',
  habit: 'habit',
  leafColour: 'leaf_colour',
  status: 'status',
  visibility: 'visibility',
  notes: 'notes',
};

const createPlantSchema = z.object({
  accessionCode: text(64),
  name: text(160),
  species: z.enum(CAPSICUM_SPECIES).default('unknown'),
  generation: optionalText(16),
  generationNumber: optionalInt(0, 100),
  isStabilized: z.boolean().default(false),
  motherPlantId: uuid.nullish(),
  fatherPlantId: uuid.nullish(),
  originPollinationId: uuid.nullish(),
  seedSource: optionalText(200),
  seedLot: optionalText(64),
  sowDate: optionalDate,
  transplantDate: optionalDate,
  firstFlowerDate: optionalDate,
  firstRipeDate: optionalDate,
  plantHeightCm: optionalNumber(0.1, 9999),
  habit: optionalEnum(GROWTH_HABIT),
  leafColour: optionalText(64),
  status: z.enum(PLANT_STATUS).default('active'),
  visibility: z.enum(PLANT_VISIBILITY).optional(),
  notes: optionalText(5000),
});

plantsRouter.post(
  '/',
  requireAuth,
  validateBody(createPlantSchema),
  asyncHandler(async (req, res) => {
    const body = req.body;
    await assertParentUsable(req.user.id, body.motherPlantId, 'mother');
    await assertParentUsable(req.user.id, body.fatherPlantId, 'father');

    // Falling back to the breeder's own default keeps new records from
    // becoming more visible than they intended.
    const visibility = body.visibility ?? req.user.default_visibility;

    const columns = Object.keys(plantFields);
    const values = columns.map((field) =>
      field === 'visibility' ? visibility : body[field] ?? null,
    );

    const { rows } = await query(
      `INSERT INTO plants (owner_id, ${columns.map((c) => plantFields[c]).join(', ')})
       VALUES ($1, ${columns.map((_, i) => `$${i + 2}`).join(', ')})
       RETURNING *`,
      [req.user.id, ...values],
    );

    res.status(201).json({ plant: serializePlant(rows[0]) });
  }),
);

// ---------------------------------------------------------------------------
// Read one
// ---------------------------------------------------------------------------

plantsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const viewerId = req.user?.id ?? null;
    await assertCanViewPlant(viewerId, req.params.id);

    const { rows } = await query(
      `SELECT ${PLANT_SELECT}
       FROM plants p JOIN users u ON u.id = p.owner_id
       WHERE p.id = $1`,
      [req.params.id],
    );

    const plant = serializePlant(rows[0]);

    // Direct relatives, redacted to what this viewer may see.
    const { rows: relatives } = await query(
      `SELECT ${PLANT_SELECT}, 'child' AS relation
       FROM plants p JOIN users u ON u.id = p.owner_id
       WHERE (p.mother_plant_id = $1 OR p.father_plant_id = $1)
         AND p.id IN (SELECT plant_id FROM accessible_plant_ids($2))
       ORDER BY p.created_at DESC`,
      [req.params.id, viewerId],
    );

    const parents = {};
    for (const [key, parentId] of [
      ['mother', rows[0].mother_plant_id],
      ['father', rows[0].father_plant_id],
    ]) {
      if (!parentId) {
        parents[key] = null;
        continue;
      }
      const visible = await canViewPlant(viewerId, parentId);
      if (!visible) {
        parents[key] = { id: parentId, restricted: true, name: 'Restricted' };
        continue;
      }
      const { rows: parentRows } = await query(
        `SELECT ${PLANT_SELECT} FROM plants p JOIN users u ON u.id = p.owner_id WHERE p.id = $1`,
        [parentId],
      );
      parents[key] = { ...serializePlant(parentRows[0]), restricted: false };
    }

    res.json({
      plant,
      parents,
      children: relatives.map((row) => serializePlant(row)),
      canEdit: viewerId === rows[0].owner_id,
    });
  }),
);

// ---------------------------------------------------------------------------
// Update / delete
// ---------------------------------------------------------------------------

const updatePlantSchema = z.object({
  accessionCode: text(64).optional(),
  name: text(160).optional(),
  species: z.enum(CAPSICUM_SPECIES).optional(),
  generation: optionalText(16),
  generationNumber: optionalInt(0, 100),
  isStabilized: z.boolean().optional(),
  motherPlantId: uuid.nullish(),
  fatherPlantId: uuid.nullish(),
  originPollinationId: uuid.nullish(),
  seedSource: optionalText(200),
  seedLot: optionalText(64),
  sowDate: optionalDate,
  transplantDate: optionalDate,
  firstFlowerDate: optionalDate,
  firstRipeDate: optionalDate,
  plantHeightCm: optionalNumber(0.1, 9999),
  habit: optionalEnum(GROWTH_HABIT),
  leafColour: optionalText(64),
  status: z.enum(PLANT_STATUS).optional(),
  visibility: z.enum(PLANT_VISIBILITY).optional(),
  notes: optionalText(5000),
});

plantsRouter.patch(
  '/:id',
  requireAuth,
  validateBody(updatePlantSchema),
  asyncHandler(async (req, res) => {
    await assertOwnsPlant(req.user.id, req.params.id);

    if ('motherPlantId' in req.body) {
      await assertParentUsable(req.user.id, req.body.motherPlantId, 'mother');
    }
    if ('fatherPlantId' in req.body) {
      await assertParentUsable(req.user.id, req.body.fatherPlantId, 'father');
    }

    const { text: sql, values } = buildUpdate('plants', plantFields, req.body, {
      where: 'id = $1',
      whereParams: [req.params.id],
    });
    const { rows } = await query(sql, values);
    res.json({ plant: serializePlant(rows[0]) });
  }),
);

plantsRouter.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    await assertOwnsPlant(req.user.id, req.params.id);
    // Children keep their pedigree pointer set to NULL via ON DELETE SET NULL
    // rather than disappearing with the parent.
    await query('DELETE FROM plants WHERE id = $1', [req.params.id]);
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------------------
// Lineage
// ---------------------------------------------------------------------------

const lineageQuerySchema = z.object({
  up: z.coerce.number().int().min(0).max(20).default(6),
  down: z.coerce.number().int().min(0).max(20).default(4),
});

plantsRouter.get(
  '/:id/lineage',
  validateQuery(lineageQuerySchema),
  asyncHandler(async (req, res) => {
    const viewerId = req.user?.id ?? null;
    await assertCanViewPlant(viewerId, req.params.id);
    const graph = await buildLineageGraph({
      rootId: req.params.id,
      viewerId,
      up: req.validatedQuery.up,
      down: req.validatedQuery.down,
    });
    res.json(graph);
  }),
);

plantsRouter.get(
  '/:id/ancestors',
  validateQuery(z.object({ depth: z.coerce.number().int().min(1).max(20).default(8) })),
  asyncHandler(async (req, res) => {
    const viewerId = req.user?.id ?? null;
    await assertCanViewPlant(viewerId, req.params.id);
    const ancestors = await listAncestors({
      rootId: req.params.id,
      viewerId,
      depth: req.validatedQuery.depth,
    });
    res.json({ ancestors });
  }),
);
