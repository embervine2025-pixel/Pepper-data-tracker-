import { Router } from 'express';
import { query } from '../db/pool.js';
import { ApiError, asyncHandler } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { buildUpdate } from '../lib/sql.js';
import { assertCanContribute, assertCanViewPlant } from '../services/access.js';
import { camelize } from '../services/serialize.js';
import {
  validateBody,
  validateQuery,
  z,
  uuid,
  optionalText,
  optionalDate,
  optionalInt,
  optionalNumber,
  optionalEnum,
} from '../lib/validate.js';
import {
  POD_SHAPE,
  POD_ORIENTATION,
  POD_SURFACE,
  PUNGENCY_METHOD,
} from '../lib/enums.js';

export const podsRouter = Router();

// A pod observation is readable exactly when the plant it hangs on is.
const VISIBLE = 'd.plant_id IN (SELECT plant_id FROM accessible_plant_ids($1))';

const POD_SELECT = `
  d.*,
  p.name           AS plant_name,
  p.accession_code AS plant_accession_code,
  p.species        AS plant_species,
  u.handle         AS recorder_handle,
  u.display_name   AS recorder_display_name
`;

const POD_FROM = `
  FROM pods d
  JOIN plants p ON p.id = d.plant_id
  JOIN users u  ON u.id = d.recorded_by
`;

function serializePod(row) {
  const {
    plant_name,
    plant_accession_code,
    plant_species,
    recorder_handle,
    recorder_display_name,
    ...rest
  } = row;

  return {
    ...camelize(rest),
    plant: {
      id: row.plant_id,
      name: plant_name,
      accessionCode: plant_accession_code,
      species: plant_species,
    },
    recordedByUser: {
      id: row.recorded_by,
      handle: recorder_handle,
      displayName: recorder_display_name,
    },
  };
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

const listSchema = z.object({
  plantId: uuid.optional(),
  pollinationId: uuid.optional(),
  shape: z.enum(POD_SHAPE).optional(),
  minShu: z.coerce.number().int().min(0).optional(),
  maxShu: z.coerce.number().int().min(0).optional(),
  mine: z.enum(['true', 'false']).optional(),
  sort: z.enum(['recent', 'shu', 'weight', 'harvest']).default('recent'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

podsRouter.get(
  '/',
  validateQuery(listSchema),
  asyncHandler(async (req, res) => {
    const f = req.validatedQuery;
    const params = [req.user?.id ?? null];
    const where = [VISIBLE];

    if (f.plantId) {
      params.push(f.plantId);
      where.push(`d.plant_id = $${params.length}`);
    }
    if (f.pollinationId) {
      params.push(f.pollinationId);
      where.push(`d.pollination_id = $${params.length}`);
    }
    if (f.shape) {
      params.push(f.shape);
      where.push(`d.shape = $${params.length}`);
    }
    if (f.minShu !== undefined) {
      params.push(f.minShu);
      where.push(`d.pungency_shu >= $${params.length}`);
    }
    if (f.maxShu !== undefined) {
      params.push(f.maxShu);
      where.push(`d.pungency_shu <= $${params.length}`);
    }
    if (f.mine === 'true') {
      if (!req.user) throw ApiError.unauthorized();
      params.push(req.user.id);
      where.push(`d.recorded_by = $${params.length}`);
    }

    const orderBy = {
      recent: 'd.created_at DESC',
      shu: 'd.pungency_shu DESC NULLS LAST',
      weight: 'd.weight_g DESC NULLS LAST',
      harvest: 'd.harvest_date DESC NULLS LAST',
    }[f.sort];

    params.push(f.limit, f.offset);
    const { rows } = await query(
      `SELECT ${POD_SELECT}, COUNT(*) OVER() AS total_count
       ${POD_FROM}
       WHERE ${where.join(' AND ')}
       ORDER BY ${orderBy}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    res.json({
      pods: rows.map(({ total_count, ...row }) => serializePod(row)),
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

const podFields = {
  plantId: 'plant_id',
  pollinationId: 'pollination_id',
  podLabel: 'pod_label',
  harvestDate: 'harvest_date',
  fullyRipe: 'fully_ripe',
  daysToRipen: 'days_to_ripen',
  colourImmature: 'colour_immature',
  colourMature: 'colour_mature',
  shape: 'shape',
  orientation: 'orientation',
  surface: 'surface',
  lengthMm: 'length_mm',
  widthMm: 'width_mm',
  wallThicknessMm: 'wall_thickness_mm',
  weightG: 'weight_g',
  seedCount: 'seed_count',
  placentaColour: 'placenta_colour',
  pungencyShu: 'pungency_shu',
  pungencyMeasure: 'pungency_measure',
  heatRating: 'heat_rating',
  flavourNotes: 'flavour_notes',
  aromaNotes: 'aroma_notes',
  photoUrl: 'photo_url',
  notes: 'notes',
};

const podShape = z.object({
  pollinationId: uuid.nullish(),
  podLabel: optionalText(64),
  harvestDate: optionalDate,
  fullyRipe: z.boolean().default(true),
  daysToRipen: optionalInt(0, 400),
  colourImmature: optionalText(64),
  colourMature: optionalText(64),
  shape: optionalEnum(POD_SHAPE),
  orientation: optionalEnum(POD_ORIENTATION),
  surface: optionalEnum(POD_SURFACE),
  lengthMm: optionalNumber(0.1, 9999),
  widthMm: optionalNumber(0.1, 9999),
  wallThicknessMm: optionalNumber(0.01, 999),
  weightG: optionalNumber(0.01, 99999),
  seedCount: optionalInt(0, 100000),
  placentaColour: optionalText(64),
  pungencyShu: optionalInt(0, 5_000_000),
  pungencyMeasure: optionalEnum(PUNGENCY_METHOD),
  heatRating: optionalInt(0, 10),
  flavourNotes: optionalText(2000),
  aromaNotes: optionalText(2000),
  photoUrl: optionalText(500),
  notes: optionalText(5000),
});

// A Scoville number is only meaningful alongside how it was obtained.
const requireMeasureWithShu = (v) =>
  v.pungencyShu == null || v.pungencyMeasure != null;

const createSchema = podShape
  .extend({ plantId: uuid })
  .refine(requireMeasureWithShu, {
    message: 'State how the Scoville figure was obtained',
    path: ['pungencyMeasure'],
  });

podsRouter.post(
  '/',
  requireAuth,
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    const body = req.body;
    await assertCanContribute(req.user.id, body.plantId);

    if (body.pollinationId) {
      // The cross must exist and be one this viewer can see; otherwise the
      // pod would claim a provenance the recorder cannot verify.
      const { rows } = await query(
        `SELECT 1 FROM pollinations x
          WHERE x.id = $2
            AND x.mother_plant_id IN (SELECT plant_id FROM accessible_plant_ids($1))`,
        [req.user.id, body.pollinationId],
      );
      if (rows.length === 0) {
        throw ApiError.badRequest('That pollination record does not exist or is not visible to you');
      }
    }

    const columns = Object.keys(podFields);
    const values = columns.map((field) => body[field] ?? null);

    const { rows } = await query(
      `INSERT INTO pods (recorded_by, ${columns.map((c) => podFields[c]).join(', ')})
       VALUES ($1, ${columns.map((_, i) => `$${i + 2}`).join(', ')})
       RETURNING id`,
      [req.user.id, ...values],
    );

    const { rows: full } = await query(`SELECT ${POD_SELECT} ${POD_FROM} WHERE d.id = $1`, [
      rows[0].id,
    ]);
    res.status(201).json({ pod: serializePod(full[0]) });
  }),
);

// ---------------------------------------------------------------------------
// Read / update / delete
// ---------------------------------------------------------------------------

async function loadVisible(req) {
  const { rows } = await query(
    `SELECT ${POD_SELECT}, p.owner_id ${POD_FROM} WHERE d.id = $2 AND ${VISIBLE}`,
    [req.user?.id ?? null, req.params.id],
  );
  if (rows.length === 0) throw ApiError.notFound('Pod record not found');
  return rows[0];
}

podsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const row = await loadVisible(req);
    const { owner_id, ...pod } = row;
    res.json({
      pod: serializePod(pod),
      canEdit: req.user?.id === row.recorded_by || req.user?.id === owner_id,
    });
  }),
);

const updateSchema = podShape.partial().refine(requireMeasureWithShu, {
  message: 'State how the Scoville figure was obtained',
  path: ['pungencyMeasure'],
});

podsRouter.patch(
  '/:id',
  requireAuth,
  validateBody(updateSchema),
  asyncHandler(async (req, res) => {
    const existing = await loadVisible(req);
    // The recorder may correct their own observation; the plant's owner may
    // curate anything recorded against their plant.
    if (existing.recorded_by !== req.user.id && existing.owner_id !== req.user.id) {
      throw ApiError.forbidden('Only the recorder or the plant owner can edit this pod record');
    }

    const { text: sql, values } = buildUpdate('pods', podFields, req.body, {
      where: 'id = $1',
      whereParams: [req.params.id],
    });
    await query(sql, values);

    const { rows } = await query(`SELECT ${POD_SELECT} ${POD_FROM} WHERE d.id = $1`, [
      req.params.id,
    ]);
    res.json({ pod: serializePod(rows[0]) });
  }),
);

podsRouter.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const existing = await loadVisible(req);
    if (existing.recorded_by !== req.user.id && existing.owner_id !== req.user.id) {
      throw ApiError.forbidden('Only the recorder or the plant owner can delete this pod record');
    }
    await query('DELETE FROM pods WHERE id = $1', [req.params.id]);
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------------------
// Aggregate phenotype summary for one plant
// ---------------------------------------------------------------------------

/**
 * Per-plant phenotype averages. Selection decisions are made on the spread
 * across a plant's pods, not on any single pod.
 */
podsRouter.get(
  '/summary/:plantId',
  asyncHandler(async (req, res) => {
    await assertCanViewPlant(req.user?.id ?? null, req.params.plantId);

    const { rows } = await query(
      `SELECT
         COUNT(*)                       AS pod_count,
         ROUND(AVG(length_mm), 1)       AS avg_length_mm,
         ROUND(AVG(width_mm), 1)        AS avg_width_mm,
         ROUND(AVG(weight_g), 1)        AS avg_weight_g,
         ROUND(AVG(wall_thickness_mm), 2) AS avg_wall_thickness_mm,
         ROUND(AVG(seed_count))         AS avg_seed_count,
         ROUND(AVG(pungency_shu))       AS avg_shu,
         MIN(pungency_shu)              AS min_shu,
         MAX(pungency_shu)              AS max_shu,
         ROUND(AVG(heat_rating), 1)     AS avg_heat_rating,
         MODE() WITHIN GROUP (ORDER BY shape)           AS common_shape,
         MODE() WITHIN GROUP (ORDER BY colour_mature)   AS common_colour_mature
       FROM pods
       WHERE plant_id = $1`,
      [req.params.plantId],
    );

    res.json({ summary: camelize(rows[0]) });
  }),
);
