import { useEffect, useMemo, useState } from 'react';
import { api, qs } from '../api/client.js';
import { useApi, useMutation } from '../lib/useApi.js';
import { Modal, Select, TextArea, Checkbox, ErrorBanner, Spinner } from './ui.jsx';
import { PERMISSION_LABELS, optionsOf } from '../lib/format.js';

/**
 * Grants one member access to a plant's lineage, or to the whole collection.
 *
 * The ancestor/descendant switches are the part that matters: sharing an F5
 * selection is usually meant to include the pedigree behind it, and almost
 * never the sibling selections beside it.
 */
export function ShareDialog({ open, onClose, onCreated, plant }) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [form, setForm] = useState({
    granteeHandle: '',
    scope: plant ? 'plant' : 'collection',
    permission: 'view',
    includeAncestors: true,
    includeDescendants: false,
    note: '',
    expiresAt: '',
  });

  // Reset each time the dialog is opened for a different plant.
  useEffect(() => {
    if (!open) return;
    setForm((f) => ({ ...f, scope: plant ? 'plant' : 'collection', granteeHandle: '' }));
    setSearch('');
  }, [open, plant]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: memberData, loading: membersLoading } = useApi(
    open ? `/members${qs({ q: debounced, limit: 12 })}` : null,
  );

  // Same reasoning as PlantPicker: never offer results from a superseded query.
  const searchStale = search !== debounced;
  const members = memberData?.members ?? [];

  const { run, pending, error } = useMutation((payload) => api.post('/shares', payload));

  const submit = async (e) => {
    e.preventDefault();
    const result = await run({
      granteeHandle: form.granteeHandle,
      scope: form.scope,
      plantId: form.scope === 'plant' ? plant?.id : undefined,
      permission: form.permission,
      includeAncestors: form.includeAncestors,
      includeDescendants: form.includeDescendants,
      note: form.note || undefined,
      // <input type="datetime-local"> yields local wall time; the API wants an
      // absolute instant.
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
    });

    if (result.ok) {
      onCreated?.(result.data.share);
      onClose();
    }
  };

  const set = (key) => (e) =>
    setForm((f) => ({
      ...f,
      [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    }));

  const scopeOptions = useMemo(
    () =>
      plant
        ? [
            { value: 'plant', label: `Just “${plant.name}” and its lineage` },
            { value: 'collection', label: 'My whole collection' },
          ]
        : [{ value: 'collection', label: 'My whole collection' }],
    [plant],
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={plant ? `Share “${plant.name}”` : 'Share your collection'}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="share-form" className="btn-primary" disabled={pending || !form.granteeHandle}>
            {pending ? 'Sharing…' : 'Grant access'}
          </button>
        </>
      }
    >
      <form id="share-form" onSubmit={submit} className="space-y-4">
        <ErrorBanner error={error} />

        <div>
          <label className="label" htmlFor="member-search">
            Member
          </label>
          <input
            id="member-search"
            type="search"
            className="input"
            placeholder="Search by name, handle or programme"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-line">
            {membersLoading || searchStale ? (
              <Spinner label="Finding members" />
            ) : members.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-ink-muted">
                No members found. They may have turned off discoverability.
              </p>
            ) : (
              <ul>
                {members.map((member) => {
                  const selected = form.granteeHandle === member.handle;
                  return (
                    <li key={member.id}>
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, granteeHandle: member.handle }))}
                        className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
                          selected ? 'bg-chile-50 text-chile-700' : 'hover:bg-surface-sunken'
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{member.displayName}</span>
                          <span className="block truncate text-xs text-ink-faint">
                            @{member.handle}
                            {member.programName ? ` · ${member.programName}` : ''}
                          </span>
                        </span>
                        {selected && <span aria-hidden="true">✓</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <Select
          label="What to share"
          value={form.scope}
          onChange={set('scope')}
          options={scopeOptions}
        />

        <Select
          label="Permission"
          value={form.permission}
          onChange={set('permission')}
          options={optionsOf(PERMISSION_LABELS)}
          hint={
            form.permission === 'contribute'
              ? 'They can record pods and crosses against this plant. They still cannot edit the plant record itself.'
              : 'They can read the record and its pod data.'
          }
        />

        {form.scope === 'plant' && (
          <div className="space-y-3 rounded-lg bg-surface-sunken p-3">
            <Checkbox
              label="Include the pedigree behind it"
              hint="Ancestors of this plant that you own. Sibling selections stay private."
              checked={form.includeAncestors}
              onChange={set('includeAncestors')}
            />
            <Checkbox
              label="Include selections made from it"
              hint="Descendants of this plant that you own."
              checked={form.includeDescendants}
              onChange={set('includeDescendants')}
            />
          </div>
        )}

        <div>
          <label className="label" htmlFor="share-expiry">
            Expires (optional)
          </label>
          <input
            id="share-expiry"
            type="datetime-local"
            className="input"
            value={form.expiresAt}
            onChange={set('expiresAt')}
          />
        </div>

        <TextArea
          label="Note (optional)"
          rows={2}
          placeholder="Why you are sharing this"
          value={form.note}
          onChange={set('note')}
        />
      </form>
    </Modal>
  );
}
