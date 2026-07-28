import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useApi, useMutation } from '../lib/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { PlantPicker } from '../components/PlantPicker.jsx';
import {
  PageHeader,
  Spinner,
  ErrorBanner,
  TextInput,
  TextArea,
  Select,
  Checkbox,
} from '../components/ui.jsx';
import {
  SPECIES_LABELS,
  STATUS_LABELS,
  HABIT_LABELS,
  VISIBILITY_LABELS,
  VISIBILITY_HELP,
  optionsOf,
} from '../lib/format.js';

const BLANK = {
  accessionCode: '',
  name: '',
  species: 'chinense',
  generation: '',
  generationNumber: '',
  isStabilized: false,
  motherPlantId: null,
  fatherPlantId: null,
  seedSource: '',
  seedLot: '',
  sowDate: '',
  transplantDate: '',
  firstFlowerDate: '',
  firstRipeDate: '',
  plantHeightCm: '',
  habit: '',
  leafColour: '',
  status: 'active',
  visibility: 'private',
  notes: '',
};

/** '' means "not provided" everywhere in these forms; the API wants null. */
const nullable = (value) => (value === '' || value === undefined ? null : value);
const numeric = (value) => (value === '' || value === null ? null : Number(value));

export default function PlantForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { user } = useAuth();

  const [form, setForm] = useState({ ...BLANK, visibility: user?.defaultVisibility ?? 'private' });
  const { data, loading, error: loadError } = useApi(isEdit ? `/plants/${id}` : null);

  useEffect(() => {
    if (!data?.plant) return;
    const p = data.plant;
    setForm({
      accessionCode: p.accessionCode ?? '',
      name: p.name ?? '',
      species: p.species ?? 'unknown',
      generation: p.generation ?? '',
      generationNumber: p.generationNumber ?? '',
      isStabilized: p.isStabilized ?? false,
      motherPlantId: p.motherPlantId ?? null,
      fatherPlantId: p.fatherPlantId ?? null,
      seedSource: p.seedSource ?? '',
      seedLot: p.seedLot ?? '',
      sowDate: p.sowDate ?? '',
      transplantDate: p.transplantDate ?? '',
      firstFlowerDate: p.firstFlowerDate ?? '',
      firstRipeDate: p.firstRipeDate ?? '',
      plantHeightCm: p.plantHeightCm ?? '',
      habit: p.habit ?? '',
      leafColour: p.leafColour ?? '',
      status: p.status ?? 'active',
      visibility: p.visibility ?? 'private',
      notes: p.notes ?? '',
    });
  }, [data]);

  const save = useMutation((payload) =>
    isEdit ? api.patch(`/plants/${id}`, payload) : api.post('/plants', payload),
  );

  const fieldErrors = save.error?.fieldErrors ?? {};

  const set = (key) => (e) =>
    setForm((f) => ({
      ...f,
      [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    }));

  const onSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      accessionCode: form.accessionCode.trim(),
      name: form.name.trim(),
      species: form.species,
      generation: nullable(form.generation.trim()),
      generationNumber: numeric(form.generationNumber),
      isStabilized: form.isStabilized,
      motherPlantId: form.motherPlantId,
      fatherPlantId: form.fatherPlantId,
      seedSource: nullable(form.seedSource.trim()),
      seedLot: nullable(form.seedLot.trim()),
      sowDate: nullable(form.sowDate),
      transplantDate: nullable(form.transplantDate),
      firstFlowerDate: nullable(form.firstFlowerDate),
      firstRipeDate: nullable(form.firstRipeDate),
      plantHeightCm: numeric(form.plantHeightCm),
      habit: nullable(form.habit),
      leafColour: nullable(form.leafColour.trim()),
      status: form.status,
      visibility: form.visibility,
      notes: nullable(form.notes.trim()),
    };

    const result = await save.run(payload);
    if (result.ok) navigate(`/plants/${result.data.plant.id}`, { replace: true });
  };

  if (isEdit && loading) return <Spinner label="Loading plant" />;
  if (isEdit && loadError) return <ErrorBanner error={loadError} />;

  return (
    <>
      <PageHeader
        title={isEdit ? `Edit ${data?.plant?.name ?? 'plant'}` : 'Add a plant'}
        subtitle={
          isEdit
            ? 'Changes apply to this accession only.'
            : 'One record per individual plant or accession you are growing.'
        }
        actions={
          <Link to={isEdit ? `/plants/${id}` : '/plants'} className="btn-secondary">
            Cancel
          </Link>
        }
      />

      <form onSubmit={onSubmit} className="max-w-3xl space-y-6" noValidate>
        <ErrorBanner error={save.error?.details?.length ? null : save.error} />

        <Section title="Identity">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput
              label="Accession code"
              required
              placeholder="EV-F3-003"
              hint="Your own code. Must be unique within your collection."
              value={form.accessionCode}
              onChange={set('accessionCode')}
              error={fieldErrors.accessionCode}
            />
            <TextInput
              label="Name"
              required
              placeholder="Ember F3 sel. 3"
              value={form.name}
              onChange={set('name')}
              error={fieldErrors.name}
            />
            <Select
              label="Species"
              value={form.species}
              onChange={set('species')}
              options={optionsOf(SPECIES_LABELS)}
              error={fieldErrors.species}
            />
            <Select
              label="Status"
              value={form.status}
              onChange={set('status')}
              options={optionsOf(STATUS_LABELS)}
            />
            <TextInput
              label="Generation"
              placeholder="F3"
              hint="Breeder's label: P, F1, F2, S1, BC1…"
              value={form.generation}
              onChange={set('generation')}
              error={fieldErrors.generation}
            />
            <TextInput
              label="Filial number"
              type="number"
              min="0"
              max="100"
              placeholder="3"
              hint="Numeric rank, used for sorting and filtering."
              value={form.generationNumber}
              onChange={set('generationNumber')}
              error={fieldErrors.generationNumber}
            />
          </div>
          <div className="mt-4">
            <Checkbox
              label="Stabilised"
              hint="Trait expression is fixed and breeds true."
              checked={form.isStabilized}
              onChange={set('isStabilized')}
            />
          </div>
        </Section>

        <Section
          title="Parentage"
          description="Leave blank for a founding accession. You can only name parents you have access to."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <PlantPicker
              label="Seed parent (mother)"
              value={form.motherPlantId}
              onChange={(v) => setForm((f) => ({ ...f, motherPlantId: v }))}
              exclude={[id, form.fatherPlantId].filter(Boolean)}
              error={fieldErrors.motherPlantId}
            />
            <PlantPicker
              label="Pollen parent (father)"
              value={form.fatherPlantId}
              onChange={(v) => setForm((f) => ({ ...f, fatherPlantId: v }))}
              exclude={[id].filter(Boolean)}
              hint="Same plant as the mother for a self."
              error={fieldErrors.fatherPlantId}
            />
            <TextInput
              label="Seed source"
              placeholder="Exchange with Northline, 2021"
              value={form.seedSource}
              onChange={set('seedSource')}
            />
            <TextInput
              label="Seed lot"
              placeholder="LOT-2024-11"
              value={form.seedLot}
              onChange={set('seedLot')}
            />
          </div>
        </Section>

        <Section title="Growing record">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <TextInput label="Sown" type="date" value={form.sowDate} onChange={set('sowDate')} />
            <TextInput
              label="Transplanted"
              type="date"
              value={form.transplantDate}
              onChange={set('transplantDate')}
            />
            <TextInput
              label="First flower"
              type="date"
              value={form.firstFlowerDate}
              onChange={set('firstFlowerDate')}
            />
            <TextInput
              label="First ripe pod"
              type="date"
              value={form.firstRipeDate}
              onChange={set('firstRipeDate')}
            />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <TextInput
              label="Height (cm)"
              type="number"
              step="0.1"
              min="0"
              value={form.plantHeightCm}
              onChange={set('plantHeightCm')}
              error={fieldErrors.plantHeightCm}
            />
            <Select
              label="Growth habit"
              value={form.habit}
              onChange={set('habit')}
              placeholder="Not recorded"
              options={optionsOf(HABIT_LABELS)}
            />
            <TextInput
              label="Leaf colour"
              placeholder="Dark green"
              value={form.leafColour}
              onChange={set('leafColour')}
            />
          </div>
        </Section>

        <Section title="Privacy">
          <Select
            label="Who can see this plant"
            value={form.visibility}
            onChange={set('visibility')}
            options={optionsOf(VISIBILITY_LABELS)}
            hint={VISIBILITY_HELP[form.visibility]}
          />
          <p className="mt-3 text-xs text-ink-faint">
            This sets the baseline. You can grant named members access to this plant and its
            pedigree separately, from the plant's page.
          </p>
        </Section>

        <Section title="Notes">
          <TextArea
            label="Observations"
            rows={5}
            placeholder="Selection reasoning, disease notes, anything you'll want in three seasons' time."
            value={form.notes}
            onChange={set('notes')}
          />
        </Section>

        <div className="flex justify-end gap-3">
          <Link to={isEdit ? `/plants/${id}` : '/plants'} className="btn-secondary">
            Cancel
          </Link>
          <button type="submit" className="btn-primary" disabled={save.pending}>
            {save.pending ? 'Saving…' : isEdit ? 'Save changes' : 'Add plant'}
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
