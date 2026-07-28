/** Mirrors the PostgreSQL enum types created in migration 001. */

export const CAPSICUM_SPECIES = [
  'annuum',
  'chinense',
  'baccatum',
  'frutescens',
  'pubescens',
  'interspecific_hybrid',
  'unknown',
];

export const PLANT_VISIBILITY = ['private', 'community', 'public'];

export const PLANT_STATUS = ['active', 'seed_stock', 'culled', 'dead', 'archived'];

export const GROWTH_HABIT = ['prostrate', 'intermediate', 'erect', 'compact'];

export const POLLINATION_METHOD = [
  'manual_emasculation',
  'bagged_self',
  'open_pollination',
  'sib_cross',
  'backcross',
];

export const POLLINATION_OUTCOME = ['pending', 'pod_set', 'aborted', 'failed'];

export const POD_SHAPE = [
  'elongate',
  'almost_round',
  'triangular',
  'campanulate',
  'blocky',
  'conical',
  'oblate',
  'lantern',
  'other',
];

export const POD_ORIENTATION = ['pendant', 'upright', 'intermediate'];

export const POD_SURFACE = ['smooth', 'semi_wrinkled', 'wrinkled', 'corrugated', 'pitted'];

export const PUNGENCY_METHOD = ['estimated', 'sensory_panel', 'hplc', 'lab_report'];

export const SHARE_SCOPE = ['collection', 'plant'];

export const SHARE_PERMISSION = ['view', 'contribute'];
