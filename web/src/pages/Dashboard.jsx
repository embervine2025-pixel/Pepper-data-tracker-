import { Link } from 'react-router-dom';
import { useApi } from '../lib/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  PageHeader,
  Spinner,
  ErrorBanner,
  StatTile,
  EmptyState,
  VisibilityBadge,
  GenerationChip,
  HeatBadge,
} from '../components/ui.jsx';
import {
  SPECIES_LABELS,
  METHOD_LABELS,
  OUTCOME_LABELS,
  PERMISSION_LABELS,
  formatDate,
  labelFor,
} from '../lib/format.js';

export default function Dashboard() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi('/dashboard/summary');

  if (loading) return <Spinner label="Loading your programme" />;
  if (error) return <ErrorBanner error={error} onRetry={reload} />;

  const { counts, speciesBreakdown, recentPlants, recentCrosses, hottestPods, activeShares } = data;

  if (Number(counts.plants) === 0) {
    return (
      <>
        <PageHeader title={`Welcome, ${user.displayName}`} />
        <EmptyState
          title="Your collection is empty"
          description="Start by adding the parent plants you are working from. Once they exist you can record crosses between them and grow out the results."
          action={
            <Link to="/plants/new" className="btn-primary">
              Add your first plant
            </Link>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user.displayName.split(' ')[0]}`}
        subtitle={user.programName ?? `@${user.handle}`}
        actions={
          <>
            <Link to="/crosses/new" className="btn-secondary">
              Record a cross
            </Link>
            <Link to="/plants/new" className="btn-primary">
              Add plant
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Plants"
          value={counts.plants}
          hint={`${counts.activePlants} currently growing`}
        />
        <StatTile
          label="Crosses"
          value={counts.crosses}
          hint={
            Number(counts.pendingCrosses) > 0
              ? `${counts.pendingCrosses} awaiting an outcome`
              : 'All outcomes recorded'
          }
        />
        <StatTile label="Pod records" value={counts.pods} hint="Phenotype observations" />
        <StatTile
          label="Shared out"
          value={counts.sharesGranted}
          hint={`${counts.sharesReceived} shared with you`}
          tone="accent"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <SectionHeading title="Recent plants" to="/plants" />
          <div className="card divide-y divide-line">
            {recentPlants.map((plant) => (
              <Link
                key={plant.id}
                to={`/plants/${plant.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-surface-sunken"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-ink">{plant.name}</span>
                    <GenerationChip generation={plant.generation} />
                  </div>
                  <p className="mt-0.5 truncate font-mono text-xs text-ink-faint">
                    {plant.accessionCode} · <span className="italic">{labelFor(SPECIES_LABELS, plant.species)}</span>
                    {plant.podCount > 0 && ` · ${plant.podCount} pod${plant.podCount === 1 ? '' : 's'}`}
                  </p>
                </div>
                <VisibilityBadge visibility={plant.visibility} />
              </Link>
            ))}
          </div>

          <div className="mt-6">
            <SectionHeading title="Recent crosses" to="/crosses" />
            {recentCrosses.length === 0 ? (
              <div className="card px-4 py-8 text-center text-sm text-ink-muted">
                No crosses recorded yet.
              </div>
            ) : (
              <div className="card divide-y divide-line">
                {recentCrosses.map((cross) => (
                  <div key={cross.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-ink">
                        {cross.motherName}
                        <span className="mx-1.5 text-ink-faint">×</span>
                        {cross.fatherName ?? <span className="italic text-ink-faint">open</span>}
                      </p>
                      <span className="chip bg-surface-sunken text-ink-muted">
                        {labelFor(OUTCOME_LABELS, cross.outcome)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-faint">
                      {formatDate(cross.pollinationDate)} · {labelFor(METHOD_LABELS, cross.method)}
                      {cross.targetTrait && ` · ${cross.targetTrait}`}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="space-y-6">
          <div>
            <SectionHeading title="By species" />
            <div className="card p-4">
              <SpeciesBars breakdown={speciesBreakdown} total={Number(counts.plants)} />
            </div>
          </div>

          <div>
            <SectionHeading title="Hottest recorded" to="/pods" />
            {hottestPods.length === 0 ? (
              <div className="card px-4 py-8 text-center text-sm text-ink-muted">
                No Scoville figures recorded yet.
              </div>
            ) : (
              <div className="card divide-y divide-line">
                {hottestPods.map((pod) => (
                  <Link
                    key={pod.id}
                    to={`/plants/${pod.plantId}`}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-surface-sunken"
                  >
                    <span className="min-w-0 truncate text-sm text-ink">{pod.plantName}</span>
                    <HeatBadge shu={pod.pungencyShu} />
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div>
            <SectionHeading title="Active shares" to="/sharing" />
            {activeShares.length === 0 ? (
              <div className="card px-4 py-8 text-center text-sm text-ink-muted">
                You haven’t shared anything yet.
              </div>
            ) : (
              <div className="card divide-y divide-line">
                {activeShares.map((share) => (
                  <div key={share.id} className="px-4 py-2.5">
                    <p className="text-sm font-medium text-ink">{share.granteeDisplayName}</p>
                    <p className="text-xs text-ink-faint">
                      {share.scope === 'collection' ? 'Whole collection' : share.plantName} ·{' '}
                      {labelFor(PERMISSION_LABELS, share.permission)}
                      {share.expiresAt && ` · until ${formatDate(share.expiresAt)}`}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function SectionHeading({ title, to }) {
  return (
    <div className="mb-2 flex items-baseline justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">{title}</h2>
      {to && (
        <Link to={to} className="text-xs font-medium text-chile-600 hover:text-chile-700">
          View all
        </Link>
      )}
    </div>
  );
}

function SpeciesBars({ breakdown, total }) {
  if (breakdown.length === 0) return <p className="text-sm text-ink-muted">No plants yet.</p>;

  return (
    <ul className="space-y-2.5">
      {breakdown.map((row) => (
        <li key={row.species}>
          <div className="flex items-baseline justify-between text-sm">
            <span className="italic text-ink">{labelFor(SPECIES_LABELS, row.species)}</span>
            <span className="tabular text-ink-muted">{row.count}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
            <div
              className="h-full rounded-full bg-chile-500"
              style={{ width: `${total ? (row.count / total) * 100 : 0}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
