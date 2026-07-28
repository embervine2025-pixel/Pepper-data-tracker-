import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, qs } from '../api/client.js';
import { useApi, useMutation } from '../lib/useApi.js';
import {
  PageHeader,
  Spinner,
  ErrorBanner,
  EmptyState,
  Modal,
  TextInput,
  Select,
} from '../components/ui.jsx';
import {
  METHOD_LABELS,
  OUTCOME_LABELS,
  VISIBILITY_LABELS,
  formatDate,
  labelFor,
  optionsOf,
} from '../lib/format.js';

const OUTCOME_CLASSES = {
  pending: 'bg-amber-100 text-amber-800',
  pod_set: 'bg-leaf-100 text-leaf-700',
  aborted: 'bg-surface-sunken text-ink-faint',
  failed: 'bg-chile-100 text-chile-700',
};

export default function Crosses() {
  const [filters, setFilters] = useState({ outcome: '', method: '', scope: 'mine' });
  const [growOut, setGrowOut] = useState(null);

  const path = useMemo(
    () =>
      `/pollinations${qs({
        outcome: filters.outcome,
        method: filters.method,
        mine: filters.scope === 'mine' ? 'true' : undefined,
        limit: 100,
      })}`,
    [filters],
  );

  const { data, loading, error, reload } = useApi(path);
  const crosses = data?.pollinations ?? [];

  const update = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));

  return (
    <>
      <PageHeader
        title="Cross-pollination records"
        subtitle="Every deliberate pollination, with the isolation that makes the result trustworthy."
        actions={
          <Link to="/crosses/new" className="btn-primary">
            Record a cross
          </Link>
        }
      />

      <div className="card mb-6 grid gap-3 p-4 sm:grid-cols-3">
        <div>
          <label className="label">Records</label>
          <select className="input" value={filters.scope} onChange={update('scope')}>
            <option value="mine">Mine only</option>
            <option value="all">All I can see</option>
          </select>
        </div>
        <div>
          <label className="label">Outcome</label>
          <select className="input" value={filters.outcome} onChange={update('outcome')}>
            <option value="">Any outcome</option>
            {optionsOf(OUTCOME_LABELS).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Method</label>
          <select className="input" value={filters.method} onChange={update('method')}>
            <option value="">Any method</option>
            {optionsOf(METHOD_LABELS).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <ErrorBanner error={error} onRetry={reload} />

      {loading ? (
        <Spinner label="Loading crosses" />
      ) : crosses.length === 0 ? (
        <EmptyState
          title="No crosses recorded"
          description="A cross record ties two plants together and gives their offspring a verifiable origin."
          action={
            <Link to="/crosses/new" className="btn-primary">
              Record a cross
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {crosses.map((cross) => (
            <article key={cross.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-ink">
                    <Link to={`/plants/${cross.mother.id}`} className="hover:text-chile-600">
                      {cross.mother.name}
                    </Link>
                    <span className="mx-2 font-normal text-ink-faint">×</span>
                    {cross.father ? (
                      <Link to={`/plants/${cross.father.id}`} className="hover:text-chile-600">
                        {cross.father.name}
                      </Link>
                    ) : (
                      <span className="font-normal italic text-ink-faint">open pollination</span>
                    )}
                  </h3>
                  <p className="mt-1 text-xs text-ink-faint">
                    {formatDate(cross.pollinationDate)} · {labelFor(METHOD_LABELS, cross.method)}
                    {cross.isolationMethod && ` · isolated with ${cross.isolationMethod}`}
                  </p>
                </div>

                <span className={`chip ${OUTCOME_CLASSES[cross.outcome]}`}>
                  {labelFor(OUTCOME_LABELS, cross.outcome)}
                </span>
              </div>

              {cross.targetTrait && (
                <p className="mt-2 text-sm text-ink-muted">
                  <span className="font-medium text-ink">Goal:</span> {cross.targetTrait}
                </p>
              )}

              <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-muted">
                <Stat label="Flowers" value={cross.flowersPollinated} />
                <Stat label="Pods set" value={cross.podsSet} />
                <Stat label="Seeds" value={cross.seedsHarvested} />
                <Stat label="Offspring grown" value={cross.offspringCount} />
                {cross.podsSet != null && cross.flowersPollinated > 0 && (
                  <Stat
                    label="Take rate"
                    value={`${Math.round((cross.podsSet / cross.flowersPollinated) * 100)}%`}
                  />
                )}
              </dl>

              {cross.notes && <p className="mt-3 text-sm text-ink-muted">{cross.notes}</p>}

              <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
                <button
                  type="button"
                  className="btn-secondary px-3 py-1.5 text-xs"
                  onClick={() => setGrowOut(cross)}
                >
                  Grow out seedling
                </button>
                <Link
                  to={`/pods/new?plantId=${cross.mother.id}&pollinationId=${cross.id}`}
                  className="btn-ghost px-3 py-1.5 text-xs"
                >
                  Record a pod from this cross
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}

      <GrowOutDialog cross={growOut} onClose={() => setGrowOut(null)} onDone={reload} />
    </>
  );
}

function Stat({ label, value }) {
  if (value === null || value === undefined) return null;
  return (
    <div>
      <dt className="inline font-medium text-ink">{value}</dt>{' '}
      <dd className="inline">{label}</dd>
    </div>
  );
}

/**
 * Sowing a cross is the moment its offspring becomes a plant record. Doing it
 * here wires parentage and the origin cross automatically, which is exactly
 * the step that gets mis-typed when done by hand.
 */
function GrowOutDialog({ cross, onClose, onDone }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    accessionCode: '',
    name: '',
    sowDate: '',
    visibility: 'private',
  });

  const create = useMutation((payload) =>
    api.post(`/pollinations/${cross.id}/offspring`, payload),
  );

  const submit = async (e) => {
    e.preventDefault();
    const result = await create.run({
      accessionCode: form.accessionCode.trim(),
      name: form.name.trim(),
      sowDate: form.sowDate || null,
      visibility: form.visibility,
    });
    if (result.ok) {
      onDone?.();
      onClose();
      navigate(`/plants/${result.data.plant.id}`);
    }
  };

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  if (!cross) return null;

  return (
    <Modal
      open={Boolean(cross)}
      onClose={onClose}
      title="Grow out a seedling"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="grow-out-form" className="btn-primary" disabled={create.pending}>
            {create.pending ? 'Creating…' : 'Create plant'}
          </button>
        </>
      }
    >
      <form id="grow-out-form" onSubmit={submit} className="space-y-4">
        <ErrorBanner error={create.error} />

        <p className="rounded-lg bg-surface-sunken p-3 text-sm text-ink-muted">
          Parentage is taken from the cross —{' '}
          <strong className="text-ink">{cross.mother.name}</strong>
          {cross.father ? (
            <>
              {' × '}
              <strong className="text-ink">{cross.father.name}</strong>
            </>
          ) : (
            ' (open pollination)'
          )}
          . The filial number continues from the seed parent.
        </p>

        <TextInput
          label="Accession code"
          required
          placeholder="EV-F4-001"
          value={form.accessionCode}
          onChange={set('accessionCode')}
          error={create.error?.fieldErrors?.accessionCode}
        />
        <TextInput
          label="Name"
          required
          placeholder="Ember F4 sel. 1"
          value={form.name}
          onChange={set('name')}
          error={create.error?.fieldErrors?.name}
        />
        <TextInput label="Sown" type="date" value={form.sowDate} onChange={set('sowDate')} />
        <Select
          label="Visibility"
          value={form.visibility}
          onChange={set('visibility')}
          options={optionsOf(VISIBILITY_LABELS)}
        />
      </form>
    </Modal>
  );
}
