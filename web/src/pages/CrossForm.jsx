import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useMutation } from '../lib/useApi.js';
import { PlantPicker } from '../components/PlantPicker.jsx';
import {
  PageHeader,
  ErrorBanner,
  TextInput,
  TextArea,
  Select,
} from '../components/ui.jsx';
import { METHOD_LABELS, OUTCOME_LABELS, optionsOf } from '../lib/format.js';

const today = () => new Date().toISOString().slice(0, 10);

export default function CrossForm() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [form, setForm] = useState({
    motherPlantId: params.get('motherPlantId'),
    fatherPlantId: null,
    method: 'manual_emasculation',
    pollinationDate: today(),
    isolationMethod: '',
    flowersPollinated: 1,
    podsSet: '',
    outcome: 'pending',
    harvestDate: '',
    seedsHarvested: '',
    targetTrait: '',
    notes: '',
  });

  // A bagged self is one plant pollinating itself; keeping the two ids in
  // step here means the form can't submit a combination the API will reject.
  useEffect(() => {
    if (form.method === 'bagged_self') {
      setForm((f) => ({ ...f, fatherPlantId: f.motherPlantId }));
    } else if (form.method === 'open_pollination') {
      setForm((f) => ({ ...f, fatherPlantId: null }));
    }
  }, [form.method, form.motherPlantId]);

  const save = useMutation((payload) => api.post('/pollinations', payload));
  const fieldErrors = save.error?.fieldErrors ?? {};

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    const result = await save.run({
      motherPlantId: form.motherPlantId,
      fatherPlantId: form.fatherPlantId,
      method: form.method,
      pollinationDate: form.pollinationDate,
      isolationMethod: form.isolationMethod.trim() || null,
      flowersPollinated: Number(form.flowersPollinated) || 1,
      podsSet: form.podsSet === '' ? null : Number(form.podsSet),
      outcome: form.outcome,
      harvestDate: form.harvestDate || null,
      seedsHarvested: form.seedsHarvested === '' ? null : Number(form.seedsHarvested),
      targetTrait: form.targetTrait.trim() || null,
      notes: form.notes.trim() || null,
    });
    if (result.ok) navigate('/crosses');
  };

  const selfing = form.method === 'bagged_self';
  const open = form.method === 'open_pollination';

  return (
    <>
      <PageHeader
        title="Record a cross"
        subtitle="The pollination event itself — what was crossed with what, and how it was kept clean."
        actions={
          <Link to="/crosses" className="btn-secondary">
            Cancel
          </Link>
        }
      />

      <form onSubmit={onSubmit} className="max-w-3xl space-y-6" noValidate>
        <ErrorBanner error={save.error?.details?.length ? null : save.error} />

        <section className="card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Parents</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <PlantPicker
              label="Seed parent (mother)"
              value={form.motherPlantId}
              onChange={(v) => setForm((f) => ({ ...f, motherPlantId: v }))}
              hint="The plant that carries the pod."
              error={fieldErrors.motherPlantId}
            />
            <div>
              <PlantPicker
                label="Pollen parent (father)"
                value={form.fatherPlantId}
                onChange={(v) => setForm((f) => ({ ...f, fatherPlantId: v }))}
                error={fieldErrors.fatherPlantId}
                hint={
                  selfing
                    ? 'Set to the seed parent automatically for a self.'
                    : open
                      ? 'Not recorded for open pollination.'
                      : undefined
                }
              />
            </div>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            The pollination
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Select
              label="Method"
              value={form.method}
              onChange={set('method')}
              options={optionsOf(METHOD_LABELS)}
              error={fieldErrors.method}
            />
            <TextInput
              label="Date"
              type="date"
              required
              value={form.pollinationDate}
              onChange={set('pollinationDate')}
              error={fieldErrors.pollinationDate}
            />
            <TextInput
              label="Isolation"
              placeholder="Organza bag"
              hint="What kept foreign pollen out."
              value={form.isolationMethod}
              onChange={set('isolationMethod')}
            />
            <TextInput
              label="Flowers pollinated"
              type="number"
              min="1"
              value={form.flowersPollinated}
              onChange={set('flowersPollinated')}
              error={fieldErrors.flowersPollinated}
            />
            <TextInput
              label="Target trait"
              placeholder="Thicker pericarp at Reaper-class heat"
              value={form.targetTrait}
              onChange={set('targetTrait')}
            />
          </div>
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Outcome</h2>
          <p className="mt-1 text-xs text-ink-faint">
            Leave as pending and come back once the pods have set.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Select
              label="Outcome"
              value={form.outcome}
              onChange={set('outcome')}
              options={optionsOf(OUTCOME_LABELS)}
            />
            <TextInput
              label="Pods set"
              type="number"
              min="0"
              value={form.podsSet}
              onChange={set('podsSet')}
              error={fieldErrors.podsSet}
            />
            <TextInput
              label="Harvested"
              type="date"
              value={form.harvestDate}
              onChange={set('harvestDate')}
              error={fieldErrors.harvestDate}
            />
            <TextInput
              label="Seeds saved"
              type="number"
              min="0"
              value={form.seedsHarvested}
              onChange={set('seedsHarvested')}
            />
          </div>
        </section>

        <section className="card p-5">
          <TextArea
            label="Notes"
            rows={4}
            placeholder="Bud stage at emasculation, weather, anything that might explain the result."
            value={form.notes}
            onChange={set('notes')}
          />
        </section>

        <div className="flex justify-end gap-3">
          <Link to="/crosses" className="btn-secondary">
            Cancel
          </Link>
          <button
            type="submit"
            className="btn-primary"
            disabled={save.pending || !form.motherPlantId}
          >
            {save.pending ? 'Saving…' : 'Record cross'}
          </button>
        </div>
      </form>
    </>
  );
}
