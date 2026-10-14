import { ArrowLeft, ArrowRight, Check, Compass, X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { prefersReducedMotion } from '../hooks/useTypewriter';
import { useAuth } from '../state/auth';

// The "explore" tour: a spotlight with a ring drawn around one part of the app at a time, and a
// short note on what it does. Targets are marked with data-tour="..."; steps whose target is not
// on screen (an empty kitchen, the phone layout) are left out. Every step can be skipped.
interface TourStep {
  target?: string;
  title: string;
  body: ReactNode;
}

const STEPS: TourStep[] = [
  {
    title: 'Welcome to FridgeWise',
    body: 'FridgeWise keeps track of the food at home so you can use it before it goes bad. This quick tour shows what each part does. It takes about a minute, and you can skip it anytime.',
  },
  {
    target: 'summary',
    title: 'Your kitchen at a glance',
    body: 'This line sums up your kitchen: how much to use today, how much to use soon and how much is still fresh. The lists below use the same colors.',
  },
  {
    target: 'scan',
    title: 'Scan a receipt or a product',
    body: 'Take a photo of a grocery receipt or a single product. AI reads the items and their expiration dates, and you check every line before anything is saved.',
  },
  {
    target: 'add',
    title: 'Add food by hand',
    body: 'No receipt? Type an item in. FridgeWise suggests how long it keeps, using the USDA FoodKeeper shelf-life table.',
  },
  {
    target: 'command',
    title: 'Tell FridgeWise what happened',
    body: 'Type or say things like "I used half the milk" or "moved the chicken to the freezer". You see a preview first, nothing changes until you confirm, and every change can be undone.',
  },
  {
    target: 'lists',
    title: 'Use today, use soon, fresh',
    body: 'Food is grouped by how soon it expires. When something is gone, tap Used or Tossed on its row. That is what your Stats are built from.',
  },
  {
    target: 'filters',
    title: 'Find anything fast',
    body: 'Search by name, or filter by fridge, freezer, pantry and category.',
  },
  {
    target: 'nav-check',
    title: 'Do I have it?',
    body: 'At the store, check what is already at home before buying it again. It works offline from your last saved list.',
  },
  {
    target: 'nav-recipes',
    title: 'Cook what is expiring',
    body: 'Chat with the AI chef about cravings, diet, allergies or time, then get three recipes built around the food that expires soonest.',
  },
  {
    target: 'nav-stats',
    title: 'See what you saved',
    body: 'Food used versus thrown away, and money saved versus wasted, by week and all-time.',
  },
  {
    target: 'nav-settings',
    title: 'Make it yours',
    body: 'Turn on morning reminders, set your timezone, change the look (dark mode, accent color, text size, contrast), see your daily AI limits and export your data.',
  },
  {
    target: 'account',
    title: 'Your daily AI allowance',
    body: 'You get 40 scans and 60 AI requests (updates, recipe chats and ideas) a day. Hover over a bar to see when it resets: midnight in your timezone.',
  },
  {
    target: 'help',
    title: 'Help is always here',
    body: 'Open the step-by-step guide, or replay this tour, from here.',
  },
  {
    title: 'You are all set',
    body: 'Start with your next grocery receipt. FridgeWise will remind you before anything goes bad.',
  },
];

const PAD = 6;
const GAP = 14;
const MARGIN = 12;

function visibleTarget(id: string): HTMLElement | null {
  const nodes = document.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`);
  for (const el of nodes) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden') return el;
  }
  return null;
}

function seenKey(userId: string) {
  return `fw-tour-seen:${userId}`;
}

function hasSeen(userId: string): boolean {
  try {
    return localStorage.getItem(seenKey(userId)) !== null;
  } catch {
    return true; // storage blocked: never auto-start, the tour can still be opened from Help
  }
}

interface TourApi {
  start: () => void;
  /** Starts the tour if this user has not finished or skipped it on this device. */
  autoStart: () => void;
  active: boolean;
}

const TourContext = createContext<TourApi | null>(null);

export function useTour(): TourApi | null {
  return useContext(TourContext);
}

export function TourProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const userId = user?.id ?? null;

  const start = useCallback(() => {
    if (pathname !== '/') navigate('/');
    setOpen(true);
  }, [navigate, pathname]);

  const autoStart = useCallback(() => {
    if (userId && !hasSeen(userId)) setOpen(true);
  }, [userId]);

  const close = useCallback(() => {
    setOpen(false);
    if (userId) {
      try {
        localStorage.setItem(seenKey(userId), new Date().toISOString());
      } catch {
        /* storage blocked */
      }
    }
  }, [userId]);

  // The tour only runs on Home, for a signed-in user (it lives above the routes, so it survives
  // the navigation that "Take the tour" does from other pages).
  const show = open && userId !== null && pathname === '/';
  const api = useMemo(() => ({ start, autoStart, active: show }), [start, autoStart, show]);
  return (
    <TourContext.Provider value={api}>
      {children}
      {show && <TourOverlay onClose={close} />}
    </TourContext.Provider>
  );
}

function TourOverlay({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [steps, setSteps] = useState<TourStep[] | null>(null);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [pop, setPop] = useState({ w: 352, h: 220 });
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const bodyId = useId();

  // Wait for the dashboard to render, then keep only the steps whose target is on screen.
  useEffect(() => {
    let tries = 0;
    let timer = 0;
    const pick = () => {
      if (visibleTarget('summary') || tries++ > 40) {
        setSteps(STEPS.filter((s) => !s.target || visibleTarget(s.target)));
      } else {
        timer = window.setTimeout(pick, 75);
      }
    };
    pick();
    return () => window.clearTimeout(timer);
  }, []);

  const step = steps?.[index];
  const last = steps ? index === steps.length - 1 : false;

  // Follow the target: scroll it into view, then track it while the page scrolls or resizes.
  useLayoutEffect(() => {
    if (!step) return;
    const el = step.target ? visibleTarget(step.target) : null;
    if (!el) {
      setRect(null);
      return;
    }
    const smooth = !prefersReducedMotion();
    const r0 = el.getBoundingClientRect();
    const fixed = getComputedStyle(el).position === 'fixed' || el.closest('nav.fixed, aside.sticky, header.sticky');
    if (!fixed && (r0.top < 80 || r0.bottom > window.innerHeight - 140)) {
      el.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
    }
    const measure = () => setRect(el.getBoundingClientRect());
    measure();
    let frame = 0;
    const until = performance.now() + 700;
    const follow = () => {
      measure();
      if (performance.now() < until) frame = requestAnimationFrame(follow);
    };
    frame = requestAnimationFrame(follow);
    window.addEventListener('scroll', measure, { capture: true, passive: true });
    window.addEventListener('resize', measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', measure, { capture: true });
      window.removeEventListener('resize', measure);
      ro.disconnect();
    };
  }, [step]);

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Measure the note so it can sit next to the target without leaving the screen.
  useLayoutEffect(() => {
    const node = dialog.current;
    if (!node) return;
    const ro = new ResizeObserver(() => setPop({ w: node.offsetWidth, h: node.offsetHeight }));
    ro.observe(node);
    return () => ro.disconnect();
  }, [steps]);

  // Move focus to the note on each step so screen readers read it; restore focus at the end.
  useEffect(() => {
    dialog.current?.focus({ preventScroll: true });
  }, [index, steps]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    // Leaving Home with the browser's back button ends the tour.
    window.addEventListener('popstate', onClose);
    return () => {
      window.removeEventListener('popstate', onClose);
      previous?.focus?.({ preventScroll: true });
    };
  }, [onClose]);

  const next = useCallback(() => {
    if (!steps) return;
    if (index >= steps.length - 1) onClose();
    else setIndex(index + 1);
  }, [index, steps, onClose]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        back();
      } else if (e.key === 'Tab' && dialog.current) {
        const nodes = dialog.current.querySelectorAll<HTMLElement>('button:not([disabled])');
        if (nodes.length === 0) return;
        const first = nodes[0];
        const lastNode = nodes[nodes.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
          e.preventDefault();
          lastNode.focus();
        } else if (!e.shiftKey && document.activeElement === lastNode) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [next, back, onClose]);

  if (!steps || !step) return null;

  // Spotlight geometry: the target plus padding, kept on screen. Pills for buttons and links,
  // rounded rectangles for bigger areas. No target: a zero-size spot in the middle (all dimmed).
  const spot = rect
    ? (() => {
        const top = Math.max(4, rect.top - PAD);
        const left = Math.max(4, rect.left - PAD);
        const bottom = Math.min(viewport.h - 4, rect.bottom + PAD);
        const right = Math.min(viewport.w - 4, rect.right + PAD);
        const h = Math.max(0, bottom - top);
        return { top, left, width: Math.max(0, right - left), height: h, radius: h <= 72 ? h / 2 : 20 };
      })()
    : { top: viewport.h / 2, left: viewport.w / 2, width: 0, height: 0, radius: 0 };

  // Where the note goes: to the right of narrow targets on the left (the sidebar), otherwise
  // below or above, otherwise pinned to the bottom of the screen.
  const w = Math.min(352, viewport.w - MARGIN * 2);
  let style: CSSProperties;
  if (!rect) {
    style = { left: (viewport.w - w) / 2, top: Math.max(MARGIN, (viewport.h - pop.h) / 2) };
  } else {
    const below = viewport.h - (spot.top + spot.height) - GAP;
    const above = spot.top - GAP;
    const clampLeft = (x: number) => Math.min(Math.max(MARGIN, x), viewport.w - w - MARGIN);
    const clampTop = (y: number) => Math.min(Math.max(MARGIN, y), viewport.h - pop.h - MARGIN);
    if (spot.left + spot.width + GAP + w + MARGIN <= viewport.w && spot.width < viewport.w / 3 && spot.left < viewport.w / 3) {
      style = { left: spot.left + spot.width + GAP, top: clampTop(spot.top + spot.height / 2 - pop.h / 2) };
    } else if (below >= pop.h + MARGIN || (below >= above && below >= pop.h)) {
      style = { left: clampLeft(spot.left + spot.width / 2 - w / 2), top: spot.top + spot.height + GAP };
    } else if (above >= pop.h + MARGIN) {
      style = { left: clampLeft(spot.left + spot.width / 2 - w / 2), top: spot.top - GAP - pop.h };
    } else {
      style = { left: clampLeft(spot.left + spot.width / 2 - w / 2), top: viewport.h - pop.h - MARGIN };
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[60]" data-testid="tour">
      {/* Blocks the page while the tour is open; scrolling still works. */}
      <div className="absolute inset-0" aria-hidden onClick={() => dialog.current?.focus()} />
      <div
        className="tour-spot"
        aria-hidden
        style={{
          top: spot.top,
          left: spot.left,
          width: spot.width,
          height: spot.height,
          borderRadius: spot.radius,
          ['--tour-r' as string]: `${spot.radius}px`,
        }}
      >
        {rect && (
          <>
            <span key={`glow-${index}`} className="tour-glow" />
            <span key={`ring-${index}`} className="tour-ring" />
          </>
        )}
      </div>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        className="tour-pop card absolute p-4 shadow-xl outline-none sm:p-5"
        style={{ ...style, width: w }}
      >
        <div key={index} className="animate-fade-in">
          <div className="flex items-center justify-between gap-2">
            <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-fg-2">
              <Compass size={14} aria-hidden /> Step {index + 1} of {steps.length}
            </p>
            {!last && (
              <button type="button" className="btn btn-ghost btn-sm -mr-2 text-fg-2" onClick={onClose}>
                Skip tour <X size={16} aria-hidden />
              </button>
            )}
          </div>
          <h2 id={titleId} className="mt-1 text-lg font-bold">
            {step.title}
          </h2>
          <p id={bodyId} className="mt-1 text-fg-2">
            {step.body}
          </p>
        </div>
        <div className="mt-4 h-1 overflow-hidden rounded-full bg-tint" aria-hidden>
          <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
        </div>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {index > 0 && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={back} aria-label="Previous step">
              <ArrowLeft size={16} aria-hidden data-anim="nudge" /> Back
            </button>
          )}
          {last ? (
            <>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  onClose();
                  navigate('/scan?type=receipt');
                }}
              >
                Scan a receipt
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
                <Check size={16} aria-hidden data-anim="pop" /> Done
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-primary btn-sm" onClick={next}>
              {index === 0 ? 'Start' : 'Next'} <ArrowRight size={16} aria-hidden data-anim="nudge" />
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
