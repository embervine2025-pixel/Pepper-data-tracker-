import { useEffect, useId, useRef, useState } from 'react';
import { useApi } from '../lib/useApi.js';
import { qs } from '../api/client.js';
import { SPECIES_LABELS } from '../lib/format.js';

/**
 * Type-ahead for choosing a plant the breeder can actually see -- used for
 * parent selection and for naming the parents of a cross. Searching hits the
 * plants endpoint, which is already scoped to the viewer's access, so this
 * cannot surface a plant they have no right to reference.
 */
export function PlantPicker({
  label,
  value,
  onChange,
  hint,
  error,
  placeholder = 'Search by name or accession code',
  exclude = [],
  scope = 'all',
}) {
  const id = useId();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  // Resolve an id passed in from an existing record so the field shows a name
  // rather than a UUID when editing.
  const { data: currentData } = useApi(
    value && (!selected || selected.id !== value) ? `/plants/${value}` : null,
  );

  useEffect(() => {
    if (currentData?.plant) setSelected(currentData.plant);
  }, [currentData]);

  useEffect(() => {
    if (!value) setSelected(null);
  }, [value]);

  const { data, loading } = useApi(
    open ? `/plants${qs({ q: debounced, mine: scope === 'mine' ? 'true' : undefined, limit: 12 })}` : null,
  );

  // Clicking outside should close the list without choosing anything.
  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => {
      if (!containerRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  // Between a keystroke and the debounced fetch, the list still holds results
  // for the previous query. Showing them invites a click that selects the
  // wrong plant, so treat that window as pending.
  const stale = search !== debounced;
  const results = (data?.plants ?? []).filter((p) => !exclude.includes(p.id));

  const choose = (plant) => {
    setSelected(plant);
    onChange(plant.id);
    setSearch('');
    setOpen(false);
  };

  const clear = () => {
    setSelected(null);
    onChange(null);
    setSearch('');
  };

  return (
    <div ref={containerRef} className="relative">
      <label className="label" htmlFor={id}>
        {label}
      </label>

      {selected ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-sunken px-3 py-2">
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-ink">{selected.name}</span>
            <span className="block truncate font-mono text-xs text-ink-faint">
              {selected.accessionCode}
              {selected.generation ? ` · ${selected.generation}` : ''}
            </span>
          </span>
          <button type="button" onClick={clear} className="btn-ghost px-2 py-1 text-xs">
            Clear
          </button>
        </div>
      ) : (
        <input
          id={id}
          type="search"
          className="input"
          placeholder={placeholder}
          value={search}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
          }}
          aria-expanded={open}
          aria-controls={`${id}-listbox`}
          role="combobox"
          aria-autocomplete="list"
        />
      )}

      {open && !selected && (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-line bg-surface-raised shadow-lg"
        >
          {loading || stale ? (
            <li className="px-3 py-4 text-center text-sm text-ink-muted">Searching…</li>
          ) : results.length === 0 ? (
            <li className="px-3 py-4 text-center text-sm text-ink-muted">No plants found</li>
          ) : (
            results.map((plant) => (
              <li key={plant.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => choose(plant)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-surface-sunken"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink">{plant.name}</span>
                    <span className="block truncate font-mono text-xs text-ink-faint">
                      {plant.accessionCode}
                      {plant.owner ? ` · @${plant.owner.handle}` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs italic text-ink-faint">
                    {SPECIES_LABELS[plant.species] ?? plant.species}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}

      {hint && !error && <p className="mt-1 text-xs text-ink-faint">{hint}</p>}
      {error && <p className="mt-1 text-xs text-chile-700">{error}</p>}
    </div>
  );
}
