import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../lib/useApi.js';
import { qs } from '../api/client.js';
import {
  PageHeader,
  Spinner,
  ErrorBanner,
  EmptyState,
  VisibilityBadge,
  SpeciesChip,
  StatusChip,
  GenerationChip,
} from '../components/ui.jsx';
import {
  SPECIES_LABELS,
  STATUS_LABELS,
  VISIBILITY_LABELS,
  formatDate,
  optionsOf,
} from '../lib/format.js';

const PAGE_SIZE = 24;

export default function Plants() {
  const [filters, setFilters] = useState({
    q: '',
    species: '',
    status: '',
    visibility: '',
    scope: 'mine',
  });
  const [offset, setOffset] = useState(0);

  const path = useMemo(
    () =>
      `/plants${qs({
        q: filters.q,
        species: filters.species,
        status: filters.status,
        visibility: filters.visibility,
        mine: filters.scope === 'mine' ? 'true' : undefined,
        limit: PAGE_SIZE,
        offset,
      })}`,
    [filters, offset],
  );

  const { data, loading, error, reload } = useApi(path);

  const update = (key) => (e) => {
    setFilters((f) => ({ ...f, [key]: e.target.value }));
    setOffset(0); // a changed filter invalidates the current page
  };

  const plants = data?.plants ?? [];
  const total = data?.pagination?.total ?? 0;

  return (
    <>
      <PageHeader
        title="Plants"
        subtitle={
          filters.scope === 'mine'
            ? 'Accessions in your own collection'
            : 'Everything visible to you, including plants shared by other breeders'
        }
        actions={
          <Link to="/plants/new" className="btn-primary">
            Add plant
          </Link>
        }
      />

      <div className="card mb-6 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <label className="label" htmlFor="plant-search">
              Search
            </label>
            <input
              id="plant-search"
              type="search"
              className="input"
              placeholder="Name or accession code"
              value={filters.q}
              onChange={update('q')}
            />
          </div>

          <FilterSelect
            label="Collection"
            value={filters.scope}
            onChange={update('scope')}
            options={[
              { value: 'mine', label: 'Mine only' },
              { value: 'all', label: 'All I can see' },
            ]}
          />
          <FilterSelect
            label="Species"
            value={filters.species}
            onChange={update('species')}
            placeholder="Any species"
            options={optionsOf(SPECIES_LABELS)}
          />
          <FilterSelect
            label="Status"
            value={filters.status}
            onChange={update('status')}
            placeholder="Any status"
            options={optionsOf(STATUS_LABELS)}
          />
        </div>

        {filters.scope === 'mine' && (
          <div className="mt-3 max-w-xs">
            <FilterSelect
              label="Visibility"
              value={filters.visibility}
              onChange={update('visibility')}
              placeholder="Any visibility"
              options={optionsOf(VISIBILITY_LABELS)}
            />
          </div>
        )}
      </div>

      <ErrorBanner error={error} onRetry={reload} />

      {loading ? (
        <Spinner label="Loading plants" />
      ) : plants.length === 0 ? (
        <EmptyState
          title="No plants match"
          description="Try widening the filters, or add the accession you are looking for."
          action={
            <Link to="/plants/new" className="btn-primary">
              Add plant
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plants.map((plant) => (
              <PlantCard key={plant.id} plant={plant} showOwner={filters.scope !== 'mine'} />
            ))}
          </div>

          <Pagination
            offset={offset}
            total={total}
            pageSize={PAGE_SIZE}
            onChange={setOffset}
            shown={plants.length}
          />
        </>
      )}
    </>
  );
}

function FilterSelect({ label, options, placeholder, ...props }) {
  return (
    <div>
      <label className="label">{label}</label>
      <select className="input" {...props}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function PlantCard({ plant, showOwner }) {
  return (
    <Link
      to={`/plants/${plant.id}`}
      className="card flex flex-col gap-3 p-4 transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-ink">{plant.name}</h3>
          <p className="mt-0.5 truncate font-mono text-xs text-ink-faint">{plant.accessionCode}</p>
        </div>
        <GenerationChip generation={plant.generation} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <SpeciesChip species={plant.species} />
        <StatusChip status={plant.status} />
        {plant.isStabilized && <span className="chip bg-leaf-100 text-leaf-700">Stable</span>}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-3 text-xs text-ink-faint">
        <span>
          {plant.podCount ?? 0} pod{plant.podCount === 1 ? '' : 's'}
          {plant.childCount > 0 && ` · ${plant.childCount} offspring`}
        </span>
        {showOwner && plant.owner ? (
          <span className="truncate">@{plant.owner.handle}</span>
        ) : (
          <VisibilityBadge visibility={plant.visibility} />
        )}
      </div>

      {plant.sowDate && (
        <p className="text-xs text-ink-faint">Sown {formatDate(plant.sowDate)}</p>
      )}
    </Link>
  );
}

function Pagination({ offset, total, pageSize, onChange, shown }) {
  if (total <= pageSize) return null;
  const from = offset + 1;
  const to = offset + shown;

  return (
    <div className="mt-6 flex items-center justify-between gap-4">
      <p className="tabular text-sm text-ink-muted">
        {from}–{to} of {total}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-secondary"
          disabled={offset === 0}
          onClick={() => onChange(Math.max(0, offset - pageSize))}
        >
          Previous
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={to >= total}
          onClick={() => onChange(offset + pageSize)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
