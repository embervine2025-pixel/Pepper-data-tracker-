import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useApi, useMutation } from '../lib/useApi.js';
import { ShareDialog } from '../components/ShareDialog.jsx';
import {
  PageHeader,
  Spinner,
  ErrorBanner,
  DetailRow,
  VisibilityBadge,
  SpeciesChip,
  StatusChip,
  GenerationChip,
  HeatBadge,
  Modal,
  LockIcon,
} from '../components/ui.jsx';
import {
  HABIT_LABELS,
  SHAPE_LABELS,
  ORIENTATION_LABELS,
  SURFACE_LABELS,
  PUNGENCY_LABELS,
  PERMISSION_LABELS,
  VISIBILITY_HELP,
  formatDate,
  formatMeasure,
  formatShu,
  labelFor,
} from '../lib/format.js';

export default function PlantDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [shareOpen, setShareOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data, loading, error, reload } = useApi(`/plants/${id}`);
  const { data: podsData } = useApi(`/pods?plantId=${id}&limit=50`);
  const { data: summaryData } = useApi(`/pods/summary/${id}`);
  const { data: crossData } = useApi(`/pollinations?plantId=${id}&limit=20`);

  const canEdit = data?.canEdit;
  const { data: audienceData, reload: reloadAudience } = useApi(
    canEdit ? `/shares/audience/${id}` : null,
  );

  const remove = useMutation(() => api.delete(`/plants/${id}`));

  if (loading) return <Spinner label="Loading plant" />;
  if (error) return <ErrorBanner error={error} onRetry={reload} />;

  const { plant, parents, children } = data;
  const pods = podsData?.pods ?? [];
  const summary = summaryData?.summary;
  const crosses = crossData?.pollinations ?? [];

  return (
    <>
      <PageHeader
        title={plant.name}
        subtitle={
          <span className="font-mono">
            {plant.accessionCode}
            {plant.owner && !canEdit ? ` · @${plant.owner.handle}` : ''}
          </span>
        }
        actions={
          <>
            <Link to={`/plants/${id}/lineage`} className="btn-secondary">
              Family tree
            </Link>
            {canEdit && (
              <>
                <button type="button" className="btn-secondary" onClick={() => setShareOpen(true)}>
                  Share
                </button>
                <Link to={`/plants/${id}/edit`} className="btn-primary">
                  Edit
                </Link>
              </>
            )}
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <SpeciesChip species={plant.species} />
        <GenerationChip generation={plant.generation} />
        <StatusChip status={plant.status} />
        <VisibilityBadge visibility={plant.visibility} />
        {plant.isStabilized && <span className="chip bg-leaf-100 text-leaf-700">Stabilised</span>}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Parentage">
            <div className="grid gap-3 sm:grid-cols-2">
              <ParentSlot label="Seed parent (mother)" parent={parents.mother} />
              <ParentSlot label="Pollen parent (father)" parent={parents.father} />
            </div>

            {children.length > 0 && (
              <div className="mt-5">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  Selections from this plant
                </h4>
                <ul className="flex flex-wrap gap-2">
                  {children.map((child) => (
                    <li key={child.id}>
                      <Link
                        to={`/plants/${child.id}`}
                        className="chip border border-line bg-surface-raised text-ink hover:bg-surface-sunken"
                      >
                        {child.name}
                        {child.generation ? ` · ${child.generation}` : ''}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!parents.mother && !parents.father && children.length === 0 && (
              <p className="mt-3 text-sm text-ink-muted">
                No parentage recorded. This plant is a founding accession in your records.
              </p>
            )}
          </Card>

          {summary && Number(summary.podCount) > 0 && (
            <Card
              title="Phenotype summary"
              subtitle={`Averaged across ${summary.podCount} pod${summary.podCount === '1' || summary.podCount === 1 ? '' : 's'}`}
            >
              <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-3">
                <dl>
                  <DetailRow label="Length">{formatMeasure(summary.avgLengthMm, 'mm')}</DetailRow>
                  <DetailRow label="Width">{formatMeasure(summary.avgWidthMm, 'mm')}</DetailRow>
                </dl>
                <dl>
                  <DetailRow label="Wall">
                    {formatMeasure(summary.avgWallThicknessMm, 'mm', 2)}
                  </DetailRow>
                  <DetailRow label="Weight">{formatMeasure(summary.avgWeightG, 'g')}</DetailRow>
                </dl>
                <dl>
                  <DetailRow label="Mean heat">{formatShu(summary.avgShu)}</DetailRow>
                  <DetailRow label="Range">
                    {summary.minShu != null
                      ? `${Number(summary.minShu).toLocaleString('en-GB')}–${Number(summary.maxShu).toLocaleString('en-GB')}`
                      : '—'}
                  </DetailRow>
                </dl>
              </div>
              {summary.commonShape && (
                <p className="mt-3 text-sm text-ink-muted">
                  Most common shape{' '}
                  <strong className="text-ink">{labelFor(SHAPE_LABELS, summary.commonShape)}</strong>
                  {summary.commonColourMature && (
                    <>
                      , ripening to <strong className="text-ink">{summary.commonColourMature}</strong>
                    </>
                  )}
                  .
                </p>
              )}
            </Card>
          )}

          <Card
            title="Pod records"
            subtitle={`${pods.length} observation${pods.length === 1 ? '' : 's'}`}
            action={
              <Link to={`/pods/new?plantId=${id}`} className="btn-secondary px-3 py-1.5 text-xs">
                Record pod
              </Link>
            }
          >
            {pods.length === 0 ? (
              <p className="text-sm text-ink-muted">
                No pods recorded yet. Phenotype data is what makes a selection defensible.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                      <th className="py-2 pr-3 font-medium">Pod</th>
                      <th className="py-2 pr-3 font-medium">Harvested</th>
                      <th className="py-2 pr-3 font-medium">Shape</th>
                      <th className="py-2 pr-3 text-right font-medium">L × W</th>
                      <th className="py-2 pr-3 text-right font-medium">Wall</th>
                      <th className="py-2 font-medium">Heat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {pods.map((pod) => (
                      <tr key={pod.id}>
                        <td className="py-2 pr-3 font-mono text-xs">{pod.podLabel ?? '—'}</td>
                        <td className="py-2 pr-3 text-ink-muted">{formatDate(pod.harvestDate)}</td>
                        <td className="py-2 pr-3">{labelFor(SHAPE_LABELS, pod.shape)}</td>
                        <td className="tabular py-2 pr-3 text-right">
                          {pod.lengthMm && pod.widthMm
                            ? `${pod.lengthMm} × ${pod.widthMm}`
                            : '—'}
                        </td>
                        <td className="tabular py-2 pr-3 text-right">
                          {pod.wallThicknessMm ?? '—'}
                        </td>
                        <td className="py-2">
                          <HeatBadge shu={pod.pungencyShu} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {crosses.length > 0 && (
            <Card title="Crosses involving this plant">
              <ul className="divide-y divide-line">
                {crosses.map((cross) => (
                  <li key={cross.id} className="py-2.5">
                    <p className="text-sm text-ink">
                      <strong>{cross.mother.name}</strong>
                      <span className="mx-1.5 text-ink-faint">×</span>
                      {cross.father ? (
                        <strong>{cross.father.name}</strong>
                      ) : (
                        <span className="italic text-ink-faint">open pollination</span>
                      )}
                    </p>
                    <p className="text-xs text-ink-faint">
                      {formatDate(cross.pollinationDate)} · {cross.outcome}
                      {cross.seedsHarvested != null && ` · ${cross.seedsHarvested} seeds`}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title="Record">
            <dl>
              <DetailRow label="Generation">{plant.generation}</DetailRow>
              <DetailRow label="Seed source">{plant.seedSource}</DetailRow>
              <DetailRow label="Seed lot">{plant.seedLot}</DetailRow>
              <DetailRow label="Sown">{formatDate(plant.sowDate)}</DetailRow>
              <DetailRow label="Transplanted">{formatDate(plant.transplantDate)}</DetailRow>
              <DetailRow label="First flower">{formatDate(plant.firstFlowerDate)}</DetailRow>
              <DetailRow label="First ripe pod">{formatDate(plant.firstRipeDate)}</DetailRow>
              <DetailRow label="Height">
                {plant.plantHeightCm ? `${plant.plantHeightCm} cm` : null}
              </DetailRow>
              <DetailRow label="Habit">{labelFor(HABIT_LABELS, plant.habit)}</DetailRow>
              <DetailRow label="Leaf colour">{plant.leafColour}</DetailRow>
            </dl>
          </Card>

          {plant.notes && (
            <Card title="Notes">
              <p className="whitespace-pre-wrap text-sm text-ink-muted">{plant.notes}</p>
            </Card>
          )}

          {canEdit && (
            <Card
              title="Who can see this"
              subtitle={VISIBILITY_HELP[plant.visibility]}
              action={
                <button
                  type="button"
                  className="btn-secondary px-3 py-1.5 text-xs"
                  onClick={() => setShareOpen(true)}
                >
                  Share
                </button>
              }
            >
              {(audienceData?.audience ?? []).length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-ink-muted">
                  <LockIcon className="h-3.5 w-3.5 shrink-0" />
                  {plant.visibility === 'private'
                    ? 'Nobody but you.'
                    : 'No individual shares — visibility alone governs access.'}
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {audienceData.audience.map((entry) => (
                    <li key={entry.member.id} className="text-sm">
                      <p className="font-medium text-ink">{entry.member.displayName}</p>
                      <p className="text-xs text-ink-faint">
                        @{entry.member.handle} ·{' '}
                        {entry.via === 'collection' ? 'whole-collection share' : 'this lineage'} ·{' '}
                        {labelFor(PERMISSION_LABELS, entry.permission)}
                        {entry.expiresAt && ` · until ${formatDate(entry.expiresAt)}`}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                to="/sharing"
                className="mt-4 inline-block text-xs font-medium text-chile-600 hover:text-chile-700"
              >
                Manage all sharing →
              </Link>
            </Card>
          )}

          {canEdit && (
            <button
              type="button"
              className="btn-danger w-full"
              onClick={() => setConfirmDelete(true)}
            >
              Delete plant
            </button>
          )}
        </div>
      </div>

      <ShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        plant={plant}
        onCreated={reloadAudience}
      />

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete “${plant.name}”?`}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setConfirmDelete(false)}>
              Keep it
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={remove.pending}
              onClick={async () => {
                const result = await remove.run();
                if (result.ok) navigate('/plants', { replace: true });
              }}
            >
              {remove.pending ? 'Deleting…' : 'Delete permanently'}
            </button>
          </>
        }
      >
        <ErrorBanner error={remove.error} />
        <p className="text-sm text-ink-muted">
          Its pod records go with it. Any selections made from this plant are kept, but they lose
          their link back to it — the pedigree above them will show a gap.
        </p>
      </Modal>
    </>
  );
}

function Card({ title, subtitle, action, children }) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-ink-faint">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function ParentSlot({ label, parent }) {
  return (
    <div className="rounded-lg border border-line p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</p>
      {!parent ? (
        <p className="mt-1 text-sm text-ink-muted">Not recorded</p>
      ) : parent.restricted ? (
        <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-muted">
          <LockIcon className="h-3.5 w-3.5" />
          Restricted — not shared with you
        </p>
      ) : (
        <Link
          to={`/plants/${parent.id}`}
          className="mt-1 block text-sm font-medium text-chile-600 hover:text-chile-700"
        >
          {parent.name}
          <span className="block font-mono text-xs font-normal text-ink-faint">
            {parent.accessionCode}
          </span>
        </Link>
      )}
    </div>
  );
}
