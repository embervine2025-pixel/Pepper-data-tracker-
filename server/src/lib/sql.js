import { ApiError } from './errors.js';

/**
 * Builds a parameterised partial UPDATE from a validated patch body.
 *
 * `columns` maps body field -> column name. Fields absent from the body are
 * left untouched; fields explicitly set to null are written as NULL, which is
 * how the API distinguishes "don't change" from "clear this value".
 */
export function buildUpdate(table, columns, patch, { where, whereParams = [] }) {
  const sets = [];
  const values = [];

  for (const [field, column] of Object.entries(columns)) {
    if (!(field in patch) || patch[field] === undefined) continue;
    values.push(patch[field]);
    sets.push(`${column} = $${values.length}`);
  }

  if (sets.length === 0) {
    throw ApiError.badRequest('Provide at least one field to update');
  }

  const whereClause = where.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + values.length}`);
  return {
    text: `UPDATE ${table} SET ${sets.join(', ')} WHERE ${whereClause} RETURNING *`,
    values: [...values, ...whereParams],
  };
}
