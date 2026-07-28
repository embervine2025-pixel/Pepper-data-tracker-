import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { qs } from '../api/client.js';
import { useApi } from '../lib/useApi.js';
import {
  PageHeader,
  Spinner,
  ErrorBanner,
  EmptyState,
  HeatBadge,
} from '../components/ui.jsx';
import {
  SHAPE_LABELS,
  SURFACE_LABELS,
  ORIENTATION_LABELS,
  PUNGENCY_LABELS,
  formatDate,
  formatShu,
  labelFor,
  optionsOf,
} from '../lib/format.js';

export default function Pods() {
  const [filters, setFilters] = useState({ shape: '', minShu: '', sort: 'recent', scope: 'mine' });

  const path = useMemo(
    () =>
      `/pods${qs({
        shape: filters.shape,
        minShu: filters.minShu,
        sort: filters.sort,
        mine: filters.scope === 'mine' ? 'true' : undefined,
        limit: 100,
      })}`,
    [filters],
  );

  const { data, loading, error, reload } = useApi(path);
  const pods = data?.pods ?? [];

  const update = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));

  return (
    <>
      <PageHeader
        title="Pod phenotypes"
        subtitle="Measured observations on harvested pods — the evidence behind every selection."
        actions={
          <Link to="/pods/new" className="btn-primary">
            Record pod
          </Link>
        }
      />

      <div className="card mb-6 grid gap-3 p-4 sm:grid-cols-4">
        <div>
          <label className="label">Records</label>
          <select className="input" value={filters.scope} onChange={update('scope')}>
            <option value="mine">Mine only</option>
            <option value="all">All I can see</option>
          </select>
        </div>
        <div>
          <label className="label">Shape</label>
          <select className="input" value={filters.shape} onChange={update('shape')}>
            <option value="">Any shape</option>
            {optionsOf(SHAPE_LABELS).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Minimum heat (SHU)</label>
          <input
            type="number"
            min="0"
            step="1000"
            className="input"
            placeholder="e.g. 100000"
            value={filters.minShu}
            onChange={update('minShu')}
          />
        </div>
        <div>
          <label className="label">Sort by</label>
          <select className="input" value={filters.sort} onChange={update('sort')}>
            <option value="recent">Most recent</option>
            <option value="shu">Hottest first</option>
            <option value="weight">Heaviest first</option>
            <option value="harvest">Harvest date</option>
          </select>
        </div>
      </div>

      <ErrorBanner error={error} onRetry={reload} />

      {loading ? (
        <Spinner label="Loading pod records" />
      ) : pods.length === 0 ? (
        <EmptyState
          title="No pod records"
          description="Record the pods you harvest and the traits you are selecting for become measurable rather than remembered."
          action={
            <Link to="/pods/new" className="btn-primary">
              Record a pod
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {pods.map((pod) => (
            <article key={pod.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    to={`/plants/${pod.plant.id}`}
                    className="truncate text-base font-semibold text-ink hover:text-chile-600"
                  >
                    {pod.plant.name}
                  </Link>
                  <p className="mt-0.5 font-mono text-xs text-ink-faint">
                    {pod.podLabel ? `${pod.podLabel} · ` : ''}
                    {pod.plant.accessionCode}
                  </p>
                </div>
                <HeatBadge shu={pod.pungencyShu} />
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                {pod.shape && (
                  <span className="chip bg-surface-sunken text-ink-muted">
                    {labelFor(SHAPE_LABELS, pod.shape)}
                  </span>
                )}
                {pod.orientation && (
                  <span className="chip bg-surface-sunken text-ink-muted">
                    {labelFor(ORIENTATION_LABELS, pod.orientation)}
                  </span>
                )}
                {pod.surface && (
                  <span className="chip bg-surface-sunken text-ink-muted">
                    {labelFor(SURFACE_LABELS, pod.surface)}
                  </span>
                )}
                {pod.colourMature && (
                  <span className="chip bg-chile-50 text-chile-700">ripens {pod.colourMature}</span>
                )}
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <Measure label="Length" value={pod.lengthMm} unit="mm" />
                <Measure label="Width" value={pod.widthMm} unit="mm" />
                <Measure label="Wall" value={pod.wallThicknessMm} unit="mm" />
                <Measure label="Weight" value={pod.weightG} unit="g" />
                <Measure label="Seeds" value={pod.seedCount} unit="" />
                <Measure label="Ripening" value={pod.daysToRipen} unit="days" />
              </dl>

              {pod.pungencyShu != null && (
                <p className="mt-3 border-t border-line pt-3 text-xs text-ink-muted">
                  {formatShu(pod.pungencyShu)} ·{' '}
                  <span className="italic">{labelFor(PUNGENCY_LABELS, pod.pungencyMeasure)}</span>
                </p>
              )}

              {pod.flavourNotes && (
                <p className="mt-2 text-sm text-ink-muted">“{pod.flavourNotes}”</p>
              )}

              <p className="mt-3 text-xs text-ink-faint">
                Harvested {formatDate(pod.harvestDate)}
                {pod.recordedByUser && ` · @${pod.recordedByUser.handle}`}
              </p>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function Measure({ label, value, unit }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="tabular font-medium text-ink">
        {value}
        {unit ? ` ${unit}` : ''}
      </dd>
    </div>
  );
}
