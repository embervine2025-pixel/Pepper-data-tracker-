import { useEffect, useId, useRef } from 'react';
import {
  SPECIES_LABELS,
  VISIBILITY_LABELS,
  STATUS_LABELS,
  HEAT_BAND_CLASSES,
  heatBand,
  formatShuShort,
} from '../lib/format.js';

export function Spinner({ label = 'Loading' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-sm text-ink-muted">
      <span
        className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-chile-600"
        aria-hidden="true"
      />
      <span>{label}…</span>
    </div>
  );
}

export function ErrorBanner({ error, onRetry }) {
  if (!error) return null;
  return (
    <div role="alert" className="rounded-lg border border-chile-300 bg-chile-50 px-4 py-3">
      <p className="text-sm font-medium text-chile-700">{error.message}</p>
      {error.details?.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm text-chile-700/90">
          {error.details.map((d, i) => (
            <li key={i}>
              <span className="font-medium">{d.field}</span>: {d.message}
            </li>
          ))}
        </ul>
      )}
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-3 btn-secondary">
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, description, action }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
      <p className="text-base font-medium text-ink">{title}</p>
      {description && <p className="max-w-md text-sm text-ink-muted">{description}</p>}
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Label + control + error, wired together for screen readers. */
export function Field({ label, error, hint, required, children }) {
  const id = useId();
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
        {/* aria-hidden so the asterisk stays out of the field's accessible
            name -- the control carries `required` instead. */}
        {required && (
          <span className="ml-0.5 text-chile-600" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children({ id, 'aria-describedby': describedBy || undefined, 'aria-invalid': !!error })}
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-ink-faint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-chile-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextInput({ label, error, hint, required, ...props }) {
  return (
    <Field label={label} error={error} hint={hint} required={required}>
      {(a11y) => <input className="input" required={required} {...a11y} {...props} />}
    </Field>
  );
}

export function TextArea({ label, error, hint, rows = 3, ...props }) {
  return (
    <Field label={label} error={error} hint={hint}>
      {(a11y) => <textarea className="input resize-y" rows={rows} {...a11y} {...props} />}
    </Field>
  );
}

export function Select({ label, error, hint, options, placeholder, required, ...props }) {
  return (
    <Field label={label} error={error} hint={hint} required={required}>
      {(a11y) => (
        <select className="input" required={required} {...a11y} {...props}>
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function Checkbox({ label, hint, ...props }) {
  const id = useId();
  return (
    <div className="flex gap-3">
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-line text-chile-600 focus:ring-chile-500"
        {...props}
      />
      <div>
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        {hint && <p className="text-xs text-ink-faint">{hint}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Domain badges
// ---------------------------------------------------------------------------

const VISIBILITY_CLASSES = {
  private: 'bg-surface-sunken text-ink-muted',
  community: 'bg-blue-100 text-blue-800',
  public: 'bg-leaf-100 text-leaf-700',
};

export function VisibilityBadge({ visibility }) {
  return (
    <span className={`chip ${VISIBILITY_CLASSES[visibility] ?? VISIBILITY_CLASSES.private}`}>
      {visibility === 'private' && <LockIcon />}
      {VISIBILITY_LABELS[visibility] ?? visibility}
    </span>
  );
}

export function SpeciesChip({ species }) {
  return (
    <span className="chip bg-surface-sunken italic text-ink-muted">
      {SPECIES_LABELS[species] ?? species}
    </span>
  );
}

export function StatusChip({ status }) {
  const tone =
    status === 'active'
      ? 'bg-leaf-100 text-leaf-700'
      : status === 'culled' || status === 'dead'
        ? 'bg-surface-sunken text-ink-faint line-through'
        : 'bg-surface-sunken text-ink-muted';
  return <span className={`chip ${tone}`}>{STATUS_LABELS[status] ?? status}</span>;
}

export function HeatBadge({ shu, showValue = true }) {
  const band = heatBand(shu);
  return (
    <span className={`chip tabular ${HEAT_BAND_CLASSES[band.level]}`}>
      {showValue && shu != null ? `${formatShuShort(shu)} · ` : ''}
      {band.label}
    </span>
  );
}

export function GenerationChip({ generation }) {
  if (!generation) return null;
  return (
    <span className="chip bg-chile-50 font-mono text-chile-700">{generation}</span>
  );
}

export function StatTile({ label, value, hint, tone = 'default' }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tabular ${
          tone === 'accent' ? 'text-chile-600' : 'text-ink'
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}

/** Definition-list row used across the detail views. */
export function DetailRow({ label, children }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line py-2 last:border-0">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="text-sm font-medium text-ink text-right">{children ?? '—'}</dd>
    </div>
  );
}

export function LockIcon({ className = 'h-3 w-3' }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M10 1a4 4 0 00-4 4v2H5a2 2 0 00-2 2v7a2 2 0 002 2h10a2 2 0 002-2v-7a2 2 0 00-2-2h-1V5a4 4 0 00-4-4zm2 6V5a2 2 0 10-4 0v2h4z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/** Simple accessible modal: focus moves in, Escape closes. */
export function Modal({ open, onClose, title, children, footer }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-ink/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 w-full max-w-lg card p-6 shadow-xl outline-none max-h-[90vh] overflow-y-auto"
      >
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <div className="mt-4">{children}</div>
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
