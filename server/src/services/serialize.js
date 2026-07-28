/**
 * The database speaks snake_case and the API speaks camelCase. Converting
 * generically here keeps route handlers from restating every column name.
 */

const camelCache = new Map();

function toCamel(key) {
  let cached = camelCache.get(key);
  if (cached === undefined) {
    cached = key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
    camelCache.set(key, cached);
  }
  return cached;
}

export function camelize(value) {
  if (Array.isArray(value)) return value.map(camelize);
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();

  const out = {};
  for (const [key, val] of Object.entries(value)) {
    out[toCamel(key)] = camelize(val);
  }
  return out;
}

/** Pulls the joined owner_* columns out into a nested object. */
export function serializePlant(row) {
  if (!row) return null;
  const {
    owner_handle,
    owner_display_name,
    owner_program_name,
    pod_count,
    child_count,
    ...plant
  } = row;

  return {
    ...camelize(plant),
    owner: owner_handle
      ? {
          id: row.owner_id,
          handle: owner_handle,
          displayName: owner_display_name,
          programName: owner_program_name ?? null,
        }
      : undefined,
    ...(pod_count !== undefined ? { podCount: Number(pod_count) } : {}),
    ...(child_count !== undefined ? { childCount: Number(child_count) } : {}),
  };
}

/**
 * A lineage node the viewer is not cleared to see. The edge is kept so the
 * family tree stays structurally honest -- a breeder who shares a plant is
 * implicitly disclosing that it has parents -- but every descriptive field is
 * withheld.
 */
export function redactedPlantNode(id) {
  return {
    id,
    restricted: true,
    name: 'Restricted',
    accessionCode: null,
    species: null,
    generation: null,
    owner: null,
  };
}

export function serializeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    handle: row.handle,
    displayName: row.display_name,
    programName: row.program_name ?? null,
    bio: row.bio ?? null,
    defaultVisibility: row.default_visibility,
    discoverable: row.discoverable,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

/** The subset of a member's profile other breeders may see. */
export function serializeMember(row) {
  if (!row) return null;
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name,
    programName: row.program_name ?? null,
    bio: row.bio ?? null,
  };
}
