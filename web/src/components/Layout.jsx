import { NavLink, Outlet, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/plants', label: 'Plants' },
  { to: '/crosses', label: 'Crosses' },
  { to: '/pods', label: 'Pods' },
  { to: '/sharing', label: 'Sharing' },
];

const navLinkClass = ({ isActive }) =>
  `flex min-h-11 items-center whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors ${
    isActive ? 'bg-chile-50 text-chile-700' : 'text-ink-muted hover:bg-surface-sunken hover:text-ink'
  }`;

// Taller and edge-to-edge on a phone: 44px is the smallest comfortable tap
// target, and the row has to hold five labels at 390px.
const mobileNavLinkClass = ({ isActive }) =>
  `flex min-h-11 flex-1 items-center justify-center whitespace-nowrap border-b-2 px-1.5 text-[13px] font-medium transition-colors ${
    isActive ? 'border-chile-600 text-chile-700' : 'border-transparent text-ink-muted'
  }`;

export function Layout() {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-full bg-surface">
      {/*
        Two rows on a phone, one on a laptop. Squeezing the brand, five
        destinations and the account block onto a single 390px row left only
        "Dash" visible, so most of the app was unreachable on mobile.
      */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface-raised/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
          <Link to="/" className="flex min-h-11 shrink-0 items-center gap-2">
            <PepperMark />
            <span className="text-base font-semibold tracking-tight text-ink">
              Pepper Genetics
            </span>
          </Link>

          <nav className="hidden flex-1 items-center gap-1 overflow-x-auto sm:flex" aria-label="Main">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            {/* Full name on wide screens; on a phone the same link becomes an
                initial, so account settings stay reachable either way. */}
            <Link
              to="/settings"
              className="hidden min-h-11 flex-col justify-center text-right sm:flex"
              title="Account settings"
            >
              <span className="block text-sm font-medium text-ink">{user?.displayName}</span>
              <span className="block text-xs text-ink-faint">
                {user?.programName ?? `@${user?.handle}`}
              </span>
            </Link>
            <Link
              to="/settings"
              aria-label="Account settings"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-sunken text-sm font-semibold text-ink-muted sm:hidden"
            >
              {(user?.displayName ?? '?').trim().charAt(0).toUpperCase()}
            </Link>
            <button
              type="button"
              onClick={signOut}
              className="btn-secondary min-h-11 px-3 text-sm"
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Second row, phones only: every destination reachable in one tap. */}
        <nav
          className="flex items-stretch justify-between gap-1 overflow-x-auto border-t border-line px-2 sm:hidden"
          aria-label="Main"
        >
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={mobileNavLinkClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}

function PepperMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true">
      <path
        d="M14.5 3.2c.6-1 2-1.5 2.9-.8.8.6.6 1.9-.2 2.6-.6.5-1.3.8-2 .9"
        fill="none"
        stroke="var(--color-leaf-600)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M15.2 6.1c2.6 1.6 3.6 5.2 2.3 8.4-1.4 3.4-4.7 5.8-8 5.4-2.6-.3-4.3-2.3-4-4.5.3-2 2-3 3.6-3.6 1.8-.7 3-1.5 3.7-3.1.6-1.4 1.4-2.9 2.4-2.6z"
        fill="var(--color-chile-600)"
      />
    </svg>
  );
}
