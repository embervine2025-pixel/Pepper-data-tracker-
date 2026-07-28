import { useState } from 'react';
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
  Checkbox,
  HeatBadge,
} from '../components/ui.jsx';
import {
  SHAPE_LABELS,
  ORIENTATION_LABELS,
  SURFACE_LABELS,
  PUNGENCY_LABELS,
  optionsOf,
} from '../lib/format.js';

export default function PodForm() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [form, setForm] = useState({
    plantId: params.get('plantId'),
    pollinationId: params.get('pollinationId') || null,
    podLabel: '',
    harvestDate: '',
    fullyRipe: true,
    daysToRipen: '',
    colourImmature: '',
    colourMature: '',
    shape: '',
    orientation: '',
    surface: '',
    lengthMm: '',
    widthMm: '',
    wallThicknessMm: '',
    weightG: '',
    seedCount: '',
    placentaColour: '',
    pungencyShu: '',
    pungencyMeasure: '',
    heatRating: '',
    flavourNotes: '',
    aromaNotes: '',
    notes: '',
  });

  const save = useMutation((payload) => api.post('/pods', payload));
  const fieldErrors = save.error?.fieldErrors ?? {};

  const set = (key) => (e) =>
    setForm((f) => ({
      ...f,
      [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    }));

  const num = (v) => (v === '' ? null : Number(v));
  const str = (v) => (v.trim() === '' ? null : v.trim());

  const onSubmit = async (e) => {
    e.preventDefault();
    const result = await save.run({
      plantId: form.plantId,
      pollinationId: form.pollinationId || null,
      podLabel: str(form.podLabel),
      harvestDate: form.harvestDate || null,
      fullyRipe: form.fullyRipe,
      daysToRipen: num(form.daysToRipen),
      colourImmature: str(form.colourImmature),
      colourMature: str(form.colourMature),
      shape: form.shape || null,
      orientation: form.orientation || null,
      surface: form.surface || null,
      lengthMm: num(form.lengthMm),
      widthMm: num(form.widthMm),
      wallThicknessMm: num(form.wallThicknessMm),
      weightG: num(form.weightG),
      seedCount: num(form.seedCount),
      placentaColour: str(form.placentaColour),
      pungencyShu: num(form.pungencyShu),
      pungencyMeasure: form.pungencyMeasure || null,
      heatRating: num(form.heatRating),
      flavourNotes: str(form.flavourNotes),
      aromaNotes: str(form.aromaNotes),
      notes: str(form.notes),
    });

    if (result.ok) navigate(`/plants/${result.data.pod.plant.id}`);
  };

  return (
    <>
      <PageHeader
        title="Record a pod"
        subtitle="Descriptors follow the standard Capsicum list, so records stay comparable between growers."
        actions={
          <Link to="/pods" className="btn-secondary">
            Cancel
          </Link>
        }
      />

      <form onSubmit={onSubmit} className="max-w-3xl space-y-6" noValidate>
        <ErrorBanner error={save.error?.details?.length ? null : save.error} />

        <Section title="Which plant">
          <div className="grid gap-4 sm:grid-cols-2">
            <PlantPicker
              label="Plant"
              value={form.plantId}
              onChange={(v) => setForm((f) => ({ ...f, plantId: v }))}
              hint="Where the pod grew."
              error={fieldErrors.plantId}
            />
            <div className="grid gap-4">
              <TextInput
                label="Pod label"
                placeholder="F3-03-A"
                hint="Your own reference for this pod."
                value={form.podLabel}
                onChange={set('podLabel')}
              />
              <TextInput
                label="Harvested"
                type="date"
                value={form.harvestDate}
                onChange={set('harvestDate')}
              />
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Checkbox
              label="Fully ripe at harvest"
              hint="Unripe pods read differently on colour and heat."
              checked={form.fullyRipe}
              onChange={set('fullyRipe')}
            />
            <TextInput
              label="Days to ripen"
              type="number"
              min="0"
              value={form.daysToRipen}
              onChange={set('daysToRipen')}
              error={fieldErrors.daysToRipen}
            />
          </div>
        </Section>

        <Section title="Appearance">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <TextInput
              label="Immature colour"
              placeholder="green"
              value={form.colourImmature}
              onChange={set('colourImmature')}
            />
            <TextInput
              label="Mature colour"
              placeholder="deep red"
              value={form.colourMature}
              onChange={set('colourMature')}
            />
            <TextInput
              label="Placenta colour"
              placeholder="orange"
              value={form.placentaColour}
              onChange={set('placentaColour')}
            />
            <Select
              label="Shape"
              value={form.shape}
              onChange={set('shape')}
              placeholder="Not recorded"
              options={optionsOf(SHAPE_LABELS)}
            />
            <Select
              label="Orientation"
              value={form.orientation}
              onChange={set('orientation')}
              placeholder="Not recorded"
              options={optionsOf(ORIENTATION_LABELS)}
            />
            <Select
              label="Surface"
              value={form.surface}
              onChange={set('surface')}
              placeholder="Not recorded"
              options={optionsOf(SURFACE_LABELS)}
            />
          </div>
        </Section>

        <Section title="Measurements">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <TextInput
              label="Length (mm)"
              type="number"
              step="0.1"
              min="0"
              value={form.lengthMm}
              onChange={set('lengthMm')}
              error={fieldErrors.lengthMm}
            />
            <TextInput
              label="Width (mm)"
              type="number"
              step="0.1"
              min="0"
              value={form.widthMm}
              onChange={set('widthMm')}
              error={fieldErrors.widthMm}
            />
            <TextInput
              label="Wall (mm)"
              type="number"
              step="0.01"
              min="0"
              value={form.wallThicknessMm}
              onChange={set('wallThicknessMm')}
              error={fieldErrors.wallThicknessMm}
            />
            <TextInput
              label="Weight (g)"
              type="number"
              step="0.01"
              min="0"
              value={form.weightG}
              onChange={set('weightG')}
              error={fieldErrors.weightG}
            />
            <TextInput
              label="Seed count"
              type="number"
              min="0"
              value={form.seedCount}
              onChange={set('seedCount')}
            />
          </div>
        </Section>

        <Section
          title="Pungency"
          description="A Scoville figure is only accepted together with how it was obtained — an estimate and an HPLC result are not the same evidence."
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <TextInput
              label="Scoville (SHU)"
              type="number"
              min="0"
              step="1000"
              placeholder="987000"
              value={form.pungencyShu}
              onChange={set('pungencyShu')}
              error={fieldErrors.pungencyShu}
            />
            <Select
              label="How measured"
              value={form.pungencyMeasure}
              onChange={set('pungencyMeasure')}
              placeholder="Select a method"
              options={optionsOf(PUNGENCY_LABELS)}
              required={form.pungencyShu !== ''}
              error={fieldErrors.pungencyMeasure}
            />
            <TextInput
              label="Your heat rating (0–10)"
              type="number"
              min="0"
              max="10"
              value={form.heatRating}
              onChange={set('heatRating')}
              error={fieldErrors.heatRating}
            />
          </div>

          {form.pungencyShu !== '' && (
            <p className="mt-3 flex items-center gap-2 text-sm text-ink-muted">
              Classified as <HeatBadge shu={Number(form.pungencyShu)} />
            </p>
          )}
        </Section>

        <Section title="Tasting notes">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextArea
              label="Flavour"
              rows={3}
              placeholder="Fruity up front, apricot finish behind the burn."
              value={form.flavourNotes}
              onChange={set('flavourNotes')}
            />
            <TextArea
              label="Aroma"
              rows={3}
              placeholder="Ripe apricot, faintly floral."
              value={form.aromaNotes}
              onChange={set('aromaNotes')}
            />
          </div>
          <div className="mt-4">
            <TextArea label="Other notes" rows={3} value={form.notes} onChange={set('notes')} />
          </div>
        </Section>

        <div className="flex justify-end gap-3">
          <Link to="/pods" className="btn-secondary">
            Cancel
          </Link>
          <button type="submit" className="btn-primary" disabled={save.pending || !form.plantId}>
            {save.pending ? 'Saving…' : 'Record pod'}
          </button>
        </div>
      </form>
    </>
  );
}

function Section({ title, description, children }) {
  return (
    <section className="card p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">{title}</h2>
      {description && <p className="mt-1 text-xs text-ink-faint">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
