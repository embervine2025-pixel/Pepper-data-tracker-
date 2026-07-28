/** Display labels for the database's enum vocabularies. */

export const SPECIES_LABELS = {
  annuum: 'C. annuum',
  chinense: 'C. chinense',
  baccatum: 'C. baccatum',
  frutescens: 'C. frutescens',
  pubescens: 'C. pubescens',
  interspecific_hybrid: 'Interspecific hybrid',
  unknown: 'Unknown',
};

export const VISIBILITY_LABELS = {
  private: 'Private',
  community: 'Members',
  public: 'Public',
};

export const VISIBILITY_HELP = {
  private: 'Only you, plus anyone you explicitly share with.',
  community: 'Any signed-in member of the platform.',
  public: 'Anyone, including people who are not signed in.',
};

export const STATUS_LABELS = {
  active: 'Active',
  seed_stock: 'Seed stock',
  culled: 'Culled',
  dead: 'Dead',
  archived: 'Archived',
};

export const METHOD_LABELS = {
  manual_emasculation: 'Manual emasculation',
  bagged_self: 'Bagged self',
  open_pollination: 'Open pollination',
  sib_cross: 'Sib cross',
  backcross: 'Backcross',
};

export const OUTCOME_LABELS = {
  pending: 'Pending',
  pod_set: 'Pod set',
  aborted: 'Aborted',
  failed: 'Failed',
};

export const SHAPE_LABELS = {
  elongate: 'Elongate',
  almost_round: 'Almost round',
  triangular: 'Triangular',
  campanulate: 'Campanulate',
  blocky: 'Blocky',
  conical: 'Conical',
  oblate: 'Oblate',
  lantern: 'Lantern',
  other: 'Other',
};

export const ORIENTATION_LABELS = {
  pendant: 'Pendant',
  upright: 'Upright',
  intermediate: 'Intermediate',
};

export const SURFACE_LABELS = {
  smooth: 'Smooth',
  semi_wrinkled: 'Semi-wrinkled',
  wrinkled: 'Wrinkled',
  corrugated: 'Corrugated',
  pitted: 'Pitted',
};

export const PUNGENCY_LABELS = {
  estimated: 'Estimated',
  sensory_panel: 'Sensory panel',
  hplc: 'HPLC',
  lab_report: 'Lab report',
};

export const HABIT_LABELS = {
  prostrate: 'Prostrate',
  intermediate: 'Intermediate',
  erect: 'Erect',
  compact: 'Compact',
};

export const PERMISSION_LABELS = {
  view: 'View only',
  contribute: 'View and record data',
};

export function labelFor(map, value, fallback = '—') {
  if (!value) return fallback;
  return map[value] ?? value;
}

/** 987000 -> "987,000 SHU"; keeps large Scoville figures readable. */
export function formatShu(value) {
  if (value === null || value === undefined) return '—';
  return `${Number(value).toLocaleString('en-GB')} SHU`;
}

export function formatShuShort(value) {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

export function formatMeasure(value, unit, digits = 1) {
  if (value === null || value === undefined) return '—';
  return `${Number(value).toFixed(digits)} ${unit}`;
}

export function formatDate(value) {
  if (!value) return '—';
  // Calendar dates arrive as plain YYYY-MM-DD and must not be shifted by a
  // timezone conversion.
  const [y, m, d] = String(value).slice(0, 10).split('-');
  if (!y || !m || !d) return String(value);
  return new Date(Date.UTC(+y, +m - 1, +d)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Bands the Scoville scale the way growers talk about it, rather than by even
 * numeric steps -- the interesting differences are all at the top.
 */
export function heatBand(shu) {
  if (shu === null || shu === undefined) return { label: 'Unrecorded', level: 0 };
  if (shu < 1000) return { label: 'Negligible', level: 1 };
  if (shu < 10_000) return { label: 'Mild', level: 2 };
  if (shu < 50_000) return { label: 'Medium', level: 3 };
  if (shu < 200_000) return { label: 'Hot', level: 4 };
  if (shu < 800_000) return { label: 'Very hot', level: 5 };
  if (shu < 1_500_000) return { label: 'Super-hot', level: 6 };
  return { label: 'Extreme', level: 7 };
}

export const HEAT_BAND_CLASSES = {
  0: 'bg-surface-sunken text-ink-faint',
  1: 'bg-leaf-100 text-leaf-700',
  2: 'bg-leaf-100 text-leaf-700',
  3: 'bg-amber-100 text-amber-800',
  4: 'bg-orange-100 text-orange-800',
  5: 'bg-chile-100 text-chile-700',
  6: 'bg-chile-600 text-white',
  7: 'bg-chile-700 text-white',
};

/** Turns an enum list from /api/meta/enums into <option> data. */
export function optionsFrom(values, labels) {
  return (values ?? []).map((value) => ({ value, label: labels?.[value] ?? value }));
}

/**
 * Builds <option> data straight from a label map. The maps above are keyed by
 * the database's enum values, so dropdowns and the schema stay in step.
 */
export function optionsOf(labelMap) {
  return Object.entries(labelMap).map(([value, label]) => ({ value, label }));
}
