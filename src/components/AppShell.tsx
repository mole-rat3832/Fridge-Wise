import { ChartColumn, ChefHat, CircleHelp, House, LogOut, Plus, ScanLine, Search, Settings, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useOnline } from '../hooks/useOnline';
import { useAuth } from '../state/auth';
import { UsageMeter } from './UsageMeter';

// The wordmark is part of the logo: it keeps the brand font and size whatever font or text size is picked.
const BRAND_FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

export function Logo({ size = 32, withText = true }: { size?: number; withText?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2" style={{ fontFamily: BRAND_FONT }}>
      <img src="/brand/logo-128.png" width={size} height={size} alt={withText ? '' : 'FridgeWise'} className="shrink-0" />
      {withText && (
        <>
          <span className="text-[18px] leading-7 font-extrabold tracking-tight">FridgeWise</span>
          <BetaTag />
        </>
      )}
    </span>
  );
}

/** FridgeWise is still in development. */
export function BetaTag() {
  return (
    <span
      className="rounded-md border border-ink/15 bg-lime px-[6px] py-[3px] text-[10.5px] font-extrabold uppercase leading-none tracking-wider text-ink"
      title="FridgeWise is in development: features may change."
    >
      Beta
    </span>
  );
}

// Phone header buttons stay 44px whatever the text size, so the header always fits on one line.
const HEADER_ICON = 'btn btn-ghost btn-icon min-h-[44px] min-w-[44px] p-[10px]';

// `tour` marks the link for the explore tour (components/Tour.tsx).
const NAV = [
  { to: '/', label: 'Home', icon: House, end: true },
  { to: '/scan', label: 'Scan', icon: ScanLine },
  { to: '/add', label: 'Add item', icon: Plus },
  { to: '/check', label: 'Do I have it?', icon: Search, tour: 'nav-check' },
  { to: '/recipes', label: 'Recipes', icon: ChefHat, tour: 'nav-recipes' },
  { to: '/stats', label: 'Stats', icon: ChartColumn, tour: 'nav-stats' },
  { to: '/settings', label: 'Settings', icon: Settings, tour: 'nav-settings' },
  { to: '/guide', label: 'How to use', icon: CircleHelp, tour: 'help' },
];

const MOBILE_NAV = [
  { to: '/', label: 'Home', icon: House, end: true },
  { to: '/check', label: 'Check', icon: Search, tour: 'nav-check' },
  { to: '/scan', label: 'Scan', icon: ScanLine, primary: true },
  { to: '/recipes', label: 'Recipes', icon: ChefHat, tour: 'nav-recipes' },
  { to: '/stats', label: 'Stats', icon: ChartColumn, tour: 'nav-stats' },
];

function initials(name: string | null | undefined, email: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length > 0) return words.slice(0, 2).map((w) => [...w][0]!.toUpperCase()).join('');
  return (email?.[0] ?? '?').toUpperCase();
}

/** Bottom of the sidebar: who is signed in and how much of today's AI allowance is left. */
function AccountCard() {
  const { user, profile, signOut } = useAuth();
  const name = profile?.display_name?.trim() || null;
  return (
    <div className="mt-4 border-t border-line pt-4" data-tour="account">
      <div className="flex items-center gap-3 px-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-lime text-sm font-extrabold text-ink" aria-hidden>
          {initials(name, user?.email)}
        </span>
        <div className="min-w-0">
          {name ? (
            <p className="truncate font-semibold leading-tight" title={name}>
              {name}
            </p>
          ) : (
            <Link to="/settings" className="text-sm font-semibold leading-tight underline underline-offset-2">
              Add your name
            </Link>
          )}
          <p className="truncate text-sm text-fg-2" title={user?.email ?? ''}>
            {user?.email}
          </p>
        </div>
      </div>
      <div className="mt-4 px-2">
        <UsageMeter compact />
      </div>
      <button type="button" onClick={() => void signOut()} className="btn btn-ghost btn-sm mt-3 w-full justify-start text-fg-2">
        <LogOut size={18} aria-hidden data-anim="nudge" /> Sign out
      </button>
    </div>
  );
}

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="sticky top-0 z-30 flex items-center justify-center gap-2 bg-slate px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-sm font-semibold text-white">
      <WifiOff size={16} aria-hidden />
      You're offline. Showing your last saved list; scanning, AI and changes need a connection.
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div className="min-h-dvh lg:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col overflow-y-auto border-r border-line bg-tint px-4 py-5 lg:flex">
        <Link to="/" className="mb-6 px-2">
          <Logo />
        </Link>
        <nav aria-label="Main" className="flex flex-1 flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, end, tour }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              data-tour={tour}
              className={({ isActive }) =>
                `flex min-h-11 items-center gap-3 rounded-xl px-3 font-semibold transition-colors ${
                  isActive ? 'bg-fg text-bg' : 'text-fg-2 hover:bg-tint hover:text-fg'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={20} aria-hidden data-anim="bounce" className={isActive ? 'nav-pop' : undefined} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <AccountCard />
      </aside>

      <div className="min-w-0 flex-1">
        <OfflineBanner />
        {/* Phone / tablet top bar */}
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-bg/90 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] backdrop-blur lg:hidden">
          <Link to="/" aria-label="FridgeWise home">
            <Logo size={28} />
          </Link>
          <div className="flex items-center">
            <Link to="/guide" className={HEADER_ICON} aria-label="How to use FridgeWise" data-tour="help">
              <CircleHelp size={22} data-anim="wiggle" />
            </Link>
            <Link to="/add" className={HEADER_ICON} aria-label="Add item">
              <Plus size={22} data-anim="turn" />
            </Link>
            <Link to="/settings" className={HEADER_ICON} aria-label="Settings" data-tour="nav-settings">
              <Settings size={22} data-anim="spin" />
            </Link>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 py-5 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] mb-nav sm:px-6 lg:mb-0 lg:px-10 lg:py-8">
          {/* Keyed by path so each page fades in when you navigate. */}
          <div key={pathname} className="animate-page-in">
            {children}
          </div>
        </main>

        {/* Phone / tablet bottom nav */}
        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-safe backdrop-blur lg:hidden"
        >
          <ul className="mx-auto flex max-w-xl items-stretch justify-around px-2 pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))]">
            {MOBILE_NAV.map(({ to, label, icon: Icon, end, primary, tour }) => (
              <li key={to} className="min-w-0 flex-1">
                <NavLink
                  to={to}
                  end={end}
                  data-tour={tour}
                  className={({ isActive }) =>
                    `flex h-16 min-w-0 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${isActive ? 'text-fg' : 'text-fg-2'}`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={`flex items-center justify-center rounded-full transition-colors ${
                          primary ? 'h-10 w-full max-w-14 bg-accent text-on-accent' : isActive ? 'h-8 w-full max-w-14 bg-tint' : 'h-8 w-full max-w-14'
                        }`}
                      >
                        <Icon size={primary ? 24 : 22} aria-hidden data-anim={primary ? 'pop' : 'bounce'} className={isActive && !primary ? 'nav-pop' : undefined} />
                      </span>
                      {/* Very wide fonts at large sizes shorten the label instead of pushing items off screen. */}
                      <span className="max-w-full truncate px-0.5">{label}</span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}
