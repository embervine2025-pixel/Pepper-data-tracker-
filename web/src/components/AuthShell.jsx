/** Split layout shared by the sign-in and registration screens. */
export function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-full lg:grid-cols-2">
      <div className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-ink-muted">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-6 text-sm text-ink-muted">{footer}</div>}
        </div>
      </div>

      <aside className="relative hidden overflow-hidden bg-chile-700 lg:block">
        <div className="flex h-full flex-col justify-center px-12 text-white">
          <p className="text-sm font-medium uppercase tracking-widest text-chile-100/80">
            Pepper Genetics
          </p>
          <p className="mt-4 max-w-md text-2xl font-semibold leading-snug">
            Keep a pedigree you can defend — every cross, every pod, every generation.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-chile-50/90">
            <li>Parentage tracked as a real family tree, not a spreadsheet column.</li>
            <li>Cross-pollination records with the isolation method that made them valid.</li>
            <li>Pod phenotypes on the standard descriptors, Scoville figures always sourced.</li>
            <li>Share a line with one collaborator without opening the whole collection.</li>
          </ul>
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-chile-600/60 blur-3xl"
        />
      </aside>
    </div>
  );
}
