import { query } from '../db/pool.js';
import { filterVisiblePlantIds } from './access.js';
import { serializePlant, redactedPlantNode } from './serialize.js';

/**
 * Builds the family tree around a plant: every ancestor up to `up`
 * generations and every descendant down to `down`, as a node/edge graph the
 * dashboard can lay out directly.
 *
 * Nodes the viewer is not cleared to see are returned redacted rather than
 * dropped, so the shape of the pedigree survives even when parts of it belong
 * to another breeder.
 */
export async function buildLineageGraph({ rootId, viewerId, up = 6, down = 4 }) {
  const { rows } = await query(
    `
    WITH RECURSIVE ancestors AS (
      SELECT p.id, 0 AS depth
      FROM plants p WHERE p.id = $1
      UNION
      SELECT parent.id, a.depth + 1
      FROM ancestors a
      JOIN plants child  ON child.id = a.id
      JOIN plants parent ON parent.id IN (child.mother_plant_id, child.father_plant_id)
      WHERE a.depth < $2
    ),
    descendants AS (
      SELECT p.id, 0 AS depth
      FROM plants p WHERE p.id = $1
      UNION
      SELECT child.id, d.depth + 1
      FROM descendants d
      JOIN plants child
        ON child.mother_plant_id = d.id OR child.father_plant_id = d.id
      WHERE d.depth < $3
    ),
    involved AS (
      -- Negative depth for ancestors, positive for descendants, so the client
      -- can lay the tree out on a single generational axis.
      SELECT id, -MAX(depth) AS depth FROM ancestors GROUP BY id
      UNION
      SELECT id, MAX(depth) AS depth FROM descendants GROUP BY id
    )
    SELECT
      p.*,
      u.handle       AS owner_handle,
      u.display_name AS owner_display_name,
      u.program_name AS owner_program_name,
      (SELECT COUNT(*) FROM pods pd WHERE pd.plant_id = p.id) AS pod_count,
      MIN(i.depth) AS depth
    FROM involved i
    JOIN plants p ON p.id = i.id
    JOIN users u  ON u.id = p.owner_id
    GROUP BY p.id, u.handle, u.display_name, u.program_name
    `,
    [rootId, up, down],
  );

  const visible = await filterVisiblePlantIds(
    viewerId,
    rows.map((r) => r.id),
  );

  const nodes = rows.map((row) => {
    if (!visible.has(row.id)) return { ...redactedPlantNode(row.id), depth: Number(row.depth) };
    return { ...serializePlant(row), depth: Number(row.depth), restricted: false };
  });

  // Edges are derived from the parent pointers of nodes present in the graph,
  // so we never emit an edge to a plant that was not collected.
  const present = new Set(rows.map((r) => r.id));
  const edges = [];
  for (const row of rows) {
    if (row.mother_plant_id && present.has(row.mother_plant_id)) {
      edges.push({ parentId: row.mother_plant_id, childId: row.id, role: 'mother' });
    }
    if (row.father_plant_id && present.has(row.father_plant_id)) {
      edges.push({ parentId: row.father_plant_id, childId: row.id, role: 'father' });
    }
  }

  const depths = nodes.map((n) => n.depth);
  return {
    rootId,
    nodes,
    edges,
    stats: {
      total: nodes.length,
      restricted: nodes.filter((n) => n.restricted).length,
      ancestors: nodes.filter((n) => n.depth < 0).length,
      descendants: nodes.filter((n) => n.depth > 0).length,
      generationsUp: depths.length ? Math.abs(Math.min(...depths)) : 0,
      generationsDown: depths.length ? Math.max(...depths, 0) : 0,
    },
  };
}

/**
 * Flat ancestor list with the path taken to reach each one, which is what a
 * pedigree table needs (as opposed to the graph a tree diagram needs).
 */
export async function listAncestors({ rootId, viewerId, depth = 8 }) {
  const { rows } = await query(
    `
    WITH RECURSIVE ancestry AS (
      SELECT p.id, p.mother_plant_id, p.father_plant_id, 1 AS depth, ARRAY[]::text[] AS path
      FROM plants p WHERE p.id = $1
      UNION ALL
      SELECT parent.id, parent.mother_plant_id, parent.father_plant_id, a.depth + 1,
             a.path || CASE WHEN parent.id = child.mother_plant_id THEN 'mother' ELSE 'father' END
      FROM ancestry a
      JOIN plants child ON child.id = a.id
      JOIN plants parent ON parent.id IN (child.mother_plant_id, child.father_plant_id)
      WHERE a.depth <= $2
    )
    SELECT p.*, a.depth - 1 AS generations_back, a.path,
           u.handle AS owner_handle, u.display_name AS owner_display_name,
           u.program_name AS owner_program_name
    FROM ancestry a
    JOIN plants p ON p.id = a.id
    JOIN users u ON u.id = p.owner_id
    WHERE a.depth > 1
    ORDER BY a.depth, p.name
    `,
    [rootId, depth],
  );

  const visible = await filterVisiblePlantIds(viewerId, rows.map((r) => r.id));

  return rows.map((row) => {
    const base = visible.has(row.id)
      ? { ...serializePlant(row), restricted: false }
      : redactedPlantNode(row.id);
    return { ...base, generationsBack: Number(row.generations_back), path: row.path };
  });
}
