import { ArrowRight, BookOpen, Code } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../state/auth';
import { Logo, OfflineBanner } from './AppShell';

const REPO_URL = 'https://github.com/mole-rat3832/Fridge-Wise';
// Header buttons keep a fixed size (like the logo) so the header fits a phone at any text size or font.
const HEADER_BTN = 'min-h-[36px] whitespace-nowrap px-[10px] py-[6px] text-[14px] tracking-normal sm:px-[12px]';

/** Header and footer for the pages anyone can open: the homepage and the guide. */
export function PublicLayout({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  return (
    <div className="flex min-h-dvh flex-col">
      <OfflineBanner />
      <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:px-6">
          <Link to="/" aria-label="FridgeWise home" className="shrink-0">
            <Logo size={28} />
          </Link>
          <nav aria-label="Site" className="flex items-center gap-1 sm:gap-2">
            <NavLink to="/guide" className={({ isActive }) => `btn btn-ghost btn-sm hidden sm:inline-flex ${isActive ? 'bg-tint text-fg' : 'text-fg-2'}`}>
              <BookOpen size={16} aria-hidden data-anim="wiggle" /> How to use
            </NavLink>
            {session ? (
              <Link to="/" className={`btn btn-primary ${HEADER_BTN}`}>
                Open app <ArrowRight size={16} aria-hidden data-anim="nudge" />
              </Link>
            ) : (
              <>
                <Link to="/signin" className={`btn btn-ghost ${HEADER_BTN}`}>
                  Sign in
                </Link>
                <Link to="/signup" className={`btn btn-primary ${HEADER_BTN}`}>
                  Sign up
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-line bg-tint pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:grid-cols-[1fr_auto] sm:px-6">
          <div className="max-w-md">
            <Logo size={28} />
            <p className="mt-3 text-sm text-fg-2">
              Built for a school AI competition. FridgeWise is in beta, so features may change. Shelf-life data from USDA FoodKeeper; always trust the package
              and your senses.
            </p>
          </div>
          <ul className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm font-semibold sm:grid-cols-1">
            <li>
              <Link to="/guide" className="hover:underline">
                How to use FridgeWise
              </Link>
            </li>
            <li>
              <Link to="/signup" className="hover:underline">
                Create an account
              </Link>
            </li>
            <li>
              <Link to="/signin" className="hover:underline">
                Sign in
              </Link>
            </li>
            <li>
              <a href={REPO_URL} className="inline-flex items-center gap-1.5 hover:underline" rel="noopener">
                <Code size={15} aria-hidden /> Source code (MIT)
              </a>
            </li>
          </ul>
          <div className="flex flex-col gap-3 border-t border-line pt-5 text-sm text-fg-2 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
            <p>© 2026 FridgeWise · A student project</p>
            <nav aria-label="Legal">
              <ul className="flex flex-wrap gap-x-5 gap-y-2 font-semibold text-fg">
                <li>
                  <Link to="/privacy" className="hover:underline">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link to="/terms" className="hover:underline">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link to="/eula" className="hover:underline">
                    EULA
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
