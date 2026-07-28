import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useApi, useMutation } from '../lib/useApi.js';
import { ShareDialog } from '../components/ShareDialog.jsx';
import {
  PageHeader,
  Spinner,
  ErrorBanner,
  EmptyState,
  Modal,
  LockIcon,
} from '../components/ui.jsx';
import { PERMISSION_LABELS, formatDate, formatDateTime, labelFor } from '../lib/format.js';

export default function Sharing() {
  const [tab, setTab] = useState('granted');
  const [shareOpen, setShareOpen] = useState(false);
  const [toRevoke, setToRevoke] = useState(null);

  const granted = useApi('/shares/granted');
  const received = useApi('/shares/received');

  const revoke = useMutation((id) => api.delete(`/shares/${id}`));

  const active = tab === 'granted' ? granted : received;

  return (
    <>
      <PageHeader
        title="Sharing and privacy"
        subtitle="Lineage you have opened to named members, and what others have opened to you."
        actions={
          <button type="button" className="btn-primary" onClick={() => setShareOpen(true)}>
            Share my collection
          </button>
        }
      />

      <div className="mb-6 flex gap-1 border-b border-line">
        <TabButton active={tab === 'granted'} onClick={() => setTab('granted')}>
          Shared by me ({granted.data?.shares?.length ?? 0})
        </TabButton>
        <TabButton active={tab === 'received'} onClick={() => setTab('received')}>
          Shared with me ({received.data?.shares?.length ?? 0})
        </TabButton>
      </div>

      <ErrorBanner error={active.error} onRetry={active.reload} />

      {active.loading ? (
        <Spinner label="Loading shares" />
      ) : (active.data?.shares ?? []).length === 0 ? (
        <EmptyState
          title={tab === 'granted' ? 'You haven’t shared anything' : 'Nothing has been shared with you'}
          description={
            tab === 'granted'
              ? 'Your records are private by default. Share a single line with a collaborator without opening the rest of your collection.'
              : 'When another breeder shares a line with you it will appear here, along with any pedigree they chose to include.'
          }
          action={
            tab === 'granted' ? (
              <button type="button" className="btn-primary" onClick={() => setShareOpen(true)}>
                Share something
              </button>
            ) : null
          }
        />
      ) : (
        <div className="space-y-3">
          {active.data.shares.map((share) => (
            <article key={share.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-ink">
                    {tab === 'granted' ? share.grantee.displayName : share.owner.displayName}
                    <span className="ml-2 text-sm font-normal text-ink-faint">
                      @{tab === 'granted' ? share.grantee.handle : share.owner.handle}
                    </span>
                  </h3>

                  <p className="mt-1 text-sm text-ink-muted">
                    {share.scope === 'collection' ? (
                      <>
                        <strong className="text-ink">Whole collection</strong> —
                        every plant {tab === 'granted' ? 'you own' : 'they own'}
                      </>
                    ) : (
                      <>
                        <Link
                          to={`/plants/${share.plant?.id}`}
                          className="font-medium text-chile-600 hover:text-chile-700"
                        >
                          {share.plant?.name}
                        </Link>
                        {share.includeAncestors && ' + its pedigree'}
                        {share.includeDescendants && ' + selections from it'}
                      </>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`chip ${
                      share.permission === 'contribute'
                        ? 'bg-chile-50 text-chile-700'
                        : 'bg-surface-sunken text-ink-muted'
                    }`}
                  >
                    {labelFor(PERMISSION_LABELS, share.permission)}
                  </span>
                  {!share.isActive && (
                    <span className="chip bg-surface-sunken text-ink-faint">Inactive</span>
                  )}
                </div>
              </div>

              {share.note && <p className="mt-3 text-sm text-ink-muted">“{share.note}”</p>}

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-xs text-ink-faint">
                <span>
                  Granted {formatDateTime(share.createdAt)}
                  {share.expiresAt && ` · expires ${formatDate(share.expiresAt)}`}
                  {share.revokedAt && ` · revoked ${formatDate(share.revokedAt)}`}
                </span>

                {tab === 'granted' && !share.revokedAt && (
                  <button
                    type="button"
                    className="btn-danger px-3 py-1 text-xs"
                    onClick={() => setToRevoke(share)}
                  >
                    Revoke
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {tab === 'granted' && (
        <p className="mt-6 flex items-start gap-2 text-xs text-ink-muted">
          <LockIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Sharing a plant along its pedigree only ever exposes plants you own. A parent belonging
            to another breeder stays restricted, and a member you share with cannot pass that
            access on to anyone else.
          </span>
        </p>
      )}

      <ShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        onCreated={() => granted.reload()}
      />

      <Modal
        open={Boolean(toRevoke)}
        onClose={() => setToRevoke(null)}
        title="Revoke this share?"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setToRevoke(null)}>
              Keep it
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={revoke.pending}
              onClick={async () => {
                const result = await revoke.run(toRevoke.id);
                if (result.ok) {
                  setToRevoke(null);
                  granted.reload();
                }
              }}
            >
              {revoke.pending ? 'Revoking…' : 'Revoke access'}
            </button>
          </>
        }
      >
        <ErrorBanner error={revoke.error} />
        <p className="text-sm text-ink-muted">
          {toRevoke?.grantee?.displayName} loses access immediately. Anything they already recorded
          against your plants stays, and the share is kept as a record of who once had access.
        </p>
      </Modal>
    </>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`-mb-px flex min-h-11 items-center border-b-2 px-4 text-sm font-medium transition-colors ${
        active
          ? 'border-chile-600 text-chile-700'
          : 'border-transparent text-ink-muted hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}
