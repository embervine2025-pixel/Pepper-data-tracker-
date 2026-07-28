import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApi } from '../lib/useApi.js';
import { FamilyTree } from '../components/FamilyTree.jsx';
import { PageHeader, Spinner, ErrorBanner, StatTile, LockIcon } from '../components/ui.jsx';
import { SPECIES_LABELS, formatDate, labelFor } from '../lib/format.js';

export default function Lineage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [depth, setDepth] = useState({ up: 6, down: 4 });

  const { data: plantData } = useApi(`/plants/${id}`);
  const { data, loading, error, reload } = useApi(
    `/plants/${id}/lineage?up=${depth.up}&down=${depth.down}`,
  );
  const { data: ancestorData } = useApi(`/plants/${id}/ancestors?depth=8`);

  const plant = plantData?.plant;

  return (
    <>
      <PageHeader
        title={plant ? `Family tree — ${plant.name}` : 'Family tree'}
        subtitle="Ancestors above, selections below. Plants shared with you appear alongside your own."
        actions={
          <Link to={`/plants/${id}`} className="btn-secondary">
            Back to plant
          </Link>
        }
      />

      <div className="card mb-6 flex flex-wrap items-end gap-4 p-4">
        <DepthControl
          label="Generations back"
          value={depth.up}
          onChange={(up) => setDepth((d) => ({ ...d, up }))}
        />
        <DepthControl
          label="Generations forward"
          value={depth.down}
          onChange={(down) => setDepth((d) => ({ ...d, down }))}
        />
      </div>

      <ErrorBanner error={error} onRetry={reload} />

      {loading ? (
        <Spinner label="Building the pedigree" />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatTile label="Plants in view" value={data.stats.total} />
            <StatTile
              label="Ancestors"
              value={data.stats.ancestors}
              hint={`${data.stats.generationsUp} generation${data.stats.generationsUp === 1 ? '' : 's'} back`}
            />
            <StatTile
              label="Descendants"
              value={data.stats.descendants}
              hint={`${data.stats.generationsDown} generation${data.stats.generationsDown === 1 ? '' : 's'} forward`}
            />
            <StatTile
              label="Restricted"
              value={data.stats.restricted}
              hint="Not shared with you"
              tone={data.stats.restricted > 0 ? 'accent' : 'default'}
            />
          </div>

          <FamilyTree
            graph={data}
            rootId={id}
            selectedId={id}
            onSelect={(node) => navigate(`/plants/${node.id}/lineage`)}
          />

          {data.stats.restricted > 0 && (
            <p className="mt-3 flex items-start gap-2 text-xs text-ink-muted">
              <LockIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {data.stats.restricted} plant{data.stats.restricted === 1 ? '' : 's'} in this
                pedigree {data.stats.restricted === 1 ? 'is' : 'are'} owned by another breeder and
                not shared with you. The link is shown so the structure stays accurate, but no
                details are disclosed.
              </span>
            </p>
          )}

          {(ancestorData?.ancestors ?? []).length > 0 && (
            <section className="mt-8">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
                Pedigree table
              </h2>
              {/* nowrap so a narrow screen scrolls the table sideways instead
                  of wrapping every plant name down three lines. */}
              <div className="card overflow-x-auto">
                <table className="w-full whitespace-nowrap text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                      <th className="px-4 py-2.5 font-medium">Generations back</th>
                      <th className="px-4 py-2.5 font-medium">Plant</th>
                      <th className="px-4 py-2.5 font-medium">Species</th>
                      <th className="px-4 py-2.5 font-medium">Line of descent</th>
                      <th className="px-4 py-2.5 font-medium">Sown</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {ancestorData.ancestors.map((ancestor, i) => (
                      <tr key={`${ancestor.id}-${i}`}>
                        <td className="tabular px-4 py-2.5 text-ink-muted">
                          {ancestor.generationsBack}
                        </td>
                        <td className="px-4 py-2.5">
                          {ancestor.restricted ? (
                            <span className="flex items-center gap-1.5 text-ink-faint">
                              <LockIcon className="h-3.5 w-3.5" />
                              Restricted
                            </span>
                          ) : (
                            <Link
                              to={`/plants/${ancestor.id}`}
                              className="font-medium text-chile-600 hover:text-chile-700"
                            >
                              {ancestor.name}
                              <span className="ml-2 font-mono text-xs font-normal text-ink-faint">
                                {ancestor.accessionCode}
                              </span>
                            </Link>
                          )}
                        </td>
                        <td className="px-4 py-2.5 italic text-ink-muted">
                          {ancestor.restricted ? '—' : labelFor(SPECIES_LABELS, ancestor.species)}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-ink-faint">
                          {ancestor.path?.length
                            ? ancestor.path.map((step) => (step === 'mother' ? '♀' : '♂')).join(' → ')
                            : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-ink-muted">
                          {ancestor.restricted ? '—' : formatDate(ancestor.sowDate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-ink-faint">
                ♀ seed parent · ♂ pollen parent. A plant reached by more than one path appears once
                per path — that is inbreeding, and it is worth seeing.
              </p>
            </section>
          )}
        </>
      )}
    </>
  );
}

function DepthControl({ label, value, onChange }) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min="0"
          max="12"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-40 accent-chile-600"
        />
        <span className="tabular w-6 text-sm text-ink-muted">{value}</span>
      </div>
    </div>
  );
}
