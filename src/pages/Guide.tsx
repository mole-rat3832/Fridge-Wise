import {
  ArrowRight,
  BellRing,
  BookOpen,
  ChartColumn,
  ChefHat,
  Compass,
  Download,
  Gauge,
  Lightbulb,
  MessageSquareText,
  Mic,
  Palette,
  Plus,
  ScanLine,
  Search,
  Target,
  UserRound,
} from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTour } from '../components/Tour';
import { FreshnessBadge, FRESHNESS_ICON, PageHeader } from '../components/ui';
import { useAuth } from '../state/auth';

// "How to use FridgeWise": the purpose of the app and a step-by-step guide for new users.
// Public, and shown inside the app (with a Take the tour button) when signed in.
interface GuideStep {
  id: string;
  icon: ReactNode;
  title: string;
  children: ReactNode;
  demo?: ReactNode;
  tip?: ReactNode;
}

/** A small, non-interactive picture of part of the app. */
function Demo({ children, label }: { children: ReactNode; label: string }) {
  return (
    <figure className="mt-4 rounded-2xl border border-dashed border-line bg-bg p-3 sm:p-4" aria-label={label}>
      <div aria-hidden className="pointer-events-none select-none">
        {children}
      </div>
    </figure>
  );
}

function ScanDemo() {
  const rows = [
    { name: 'Whole milk', date: 'Oct 20', check: false, on: true },
    { name: 'Baby spinach', date: 'Oct 18', check: true, on: true },
    { name: 'Paper bag', date: '', check: false, on: false },
  ];
  return (
    <Demo label="Example: reviewing the lines found on a receipt">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-fg-2">Review 3 lines</p>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li
            key={r.name}
            className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-2 text-sm ${r.check ? 'border-lime ring-2 ring-lime/60' : 'border-line'} ${r.on ? '' : 'opacity-60'}`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-md border text-[0.7rem] font-bold ${r.on ? 'border-transparent bg-accent text-on-accent' : 'border-line'}`}
            >
              {r.on ? '✓' : ''}
            </span>
            <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
            {r.check && <span className="badge badge-yellow">Check this</span>}
            {r.date && <span className="text-fg-2">{r.date}</span>}
          </li>
        ))}
      </ul>
    </Demo>
  );
}

function ListDemo() {
  return (
    <Demo label="Example: the three freshness groups and an item with Used and Tossed buttons">
      <div className="flex flex-wrap gap-2">
        <FreshnessBadge status="red" />
        <FreshnessBadge status="yellow" />
        <FreshnessBadge status="green" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-line border-l-4 border-l-expired px-3 py-2 text-sm">
        {(() => {
          const Icon = FRESHNESS_ICON.red;
          return <Icon size={18} />;
        })()}
        <span className="min-w-0 flex-1">
          <span className="font-semibold">Greek yogurt</span>
          <span className="block text-fg-2">Expires today · Fridge</span>
        </span>
        <span className="btn btn-secondary btn-sm">Used</span>
        <span className="btn btn-ghost btn-sm">Tossed</span>
      </div>
    </Demo>
  );
}

function CommandDemo() {
  return (
    <Demo label="Example: a plain-language update and its preview">
      <div className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm">
        <MessageSquareText size={16} className="text-fg-2" />
        <span className="min-w-0 flex-1">I used half the milk and moved the chicken to the freezer</span>
        <Mic size={16} className="text-fg-2" />
      </div>
      <div className="mt-2 rounded-xl bg-tint p-3 text-sm">
        <p className="font-semibold">Preview</p>
        <ul className="mt-1 list-disc pl-5 text-fg-2">
          <li>Milk: 1 L → 0.5 L</li>
          <li>Chicken thighs: Fridge → Freezer, keeps until Jan 12</li>
        </ul>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="btn btn-primary btn-sm">Confirm</span>
          <span className="btn btn-ghost btn-sm">Cancel</span>
        </div>
      </div>
    </Demo>
  );
}

const STEPS: GuideStep[] = [
  {
    id: 'setup',
    icon: <UserRound size={22} />,
    title: 'Create your account',
    children: (
      <>
        Sign up with your email and a password. FridgeWise then asks three quick things: how many people live with you, your timezone (so "today" and reminder
        times are right) and whether you want reminders.
      </>
    ),
  },
  {
    id: 'add',
    icon: <ScanLine size={22} />,
    title: 'Add your food',
    children: (
      <>
        Tap <strong>Scan</strong> and choose <strong>Receipt</strong> or <strong>Product</strong>, then take or upload a photo. In a few seconds the AI lists
        what it found, with an expiration date for each item. Nothing is saved yet: check the lines, fix anything that is wrong, and tap{' '}
        <strong>Confirm</strong>. No receipt? Use <strong>Add item</strong> to type food in by hand.
      </>
    ),
    demo: <ScanDemo />,
    tip: 'Fields the AI is unsure about are outlined and say "Check this". Lines that are not food, like bags and tax, start unchecked. For the best results, lay the receipt flat in good light.',
  },
  {
    id: 'use-first',
    icon: <Target size={22} />,
    title: 'See what to use first',
    children: (
      <>
        Home sorts everything into <strong>Use today</strong>, <strong>Use soon</strong> and <strong>Fresh</strong>. When something is eaten, tap{' '}
        <strong>Used</strong>; if it went bad, tap <strong>Tossed</strong>. Made a mistake? Every action shows an <strong>Undo</strong> button. Use search and
        the location filters to find things fast, and tap an item to edit it or see its history.
      </>
    ),
    demo: <ListDemo />,
  },
  {
    id: 'command',
    icon: <MessageSquareText size={22} />,
    title: 'Tell FridgeWise what happened',
    children: (
      <>
        Instead of editing items one by one, type (or tap the microphone and say) what happened, like "I used half the milk", "moved the chicken to the freezer"
        or "threw out the spinach". You get a preview of every change; nothing happens until you confirm, and you can undo it afterwards.
      </>
    ),
    demo: <CommandDemo />,
    tip: 'Moving food to the freezer or opening it updates its expiration date automatically. Dates you set yourself are never changed by the AI.',
  },
  {
    id: 'recipes',
    icon: <ChefHat size={22} />,
    title: 'Cook what is expiring',
    children: (
      <>
        Open <strong>Recipes</strong> and chat with the AI chef first: tell it what you feel like, any diet or allergies, how much time you have and how many
        people are eating. Then tap <strong>Generate ideas</strong> for three recipes built around the food that expires soonest. After cooking, tap{' '}
        <strong>I made this</strong> to update the ingredients you used.
      </>
    ),
  },
  {
    id: 'shopping',
    icon: <Search size={22} />,
    title: 'Check before you buy',
    children: (
      <>
        At the store, open <strong>Do I have it?</strong> and type an item to see if it is already at home, how much is left and when it expires. It works
        offline from your last saved list.
      </>
    ),
  },
  {
    id: 'reminders',
    icon: <BellRing size={22} />,
    title: 'Get a reminder before food expires',
    children: (
      <>
        In <strong>Settings → Reminders</strong>, turn on notifications and pick how many days ahead to be warned. You get one grouped notification in your
        morning, never a flood.
      </>
    ),
    tip: 'On iPhone and iPad (iOS 16.4 or later), add FridgeWise to your Home Screen first, then turn on reminders from the installed app. Apple only allows notifications there.',
  },
  {
    id: 'stats',
    icon: <ChartColumn size={22} />,
    title: 'See what you saved',
    children: (
      <>
        <strong>Stats</strong> shows how much food you used versus threw away, and the money saved versus wasted, by week and all-time. Every Used and Tossed
        tap counts.
      </>
    ),
  },
  {
    id: 'appearance',
    icon: <Palette size={22} />,
    title: 'Make it yours',
    children: (
      <>
        In <strong>Settings → Appearance</strong>, choose light or dark, an accent color, larger text, high contrast, square corners, or turn off animations.
        You can also export your data as CSV or delete your account there.
      </>
    ),
  },
  {
    id: 'limits',
    icon: <Gauge size={22} />,
    title: 'Know your daily AI limits',
    children: (
      <>
        Each account gets <strong>40 scans</strong> and <strong>60 AI requests</strong> (plain-language updates, recipe chats and ideas) per day. The bars at
        the bottom of the sidebar, and in Settings on phones, show how many you have left. Hover over a bar to see the reset time: midnight in your timezone.
      </>
    ),
  },
];

export function Guide() {
  const { session, profile } = useAuth();
  const inApp = Boolean(session && profile?.onboarded_at);
  const tour = useTour();
  const canTour = inApp && tour !== null;
  useEffect(() => {
    document.title = 'How to use FridgeWise';
    return () => {
      document.title = 'FridgeWise';
    };
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="How to use FridgeWise"
        subtitle="A step-by-step guide for new users. It takes about three minutes to read."
        icon={<BookOpen size={24} data-anim="wiggle" />}
      />

      <section className="card scroll-reveal p-5 sm:p-6" aria-labelledby="purpose-title">
        <h2 id="purpose-title" className="flex items-center gap-2 text-lg font-bold">
          <Lightbulb size={20} aria-hidden /> What FridgeWise is for
        </h2>
        <p className="mt-2 text-fg-2">
          About 60% of the food that gets wasted is thrown away at home, usually because it was forgotten until it went bad. FridgeWise keeps a list of the food
          you have, tells you what to use first, reminds you before it expires and suggests what to cook with it. The AI does the typing for you, but it never
          changes anything without your OK.
        </p>
      </section>

      <section className="card flex flex-col gap-4 bg-lime p-5 text-ink sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Compass size={20} aria-hidden /> {canTour ? 'Rather look around?' : 'Want to try it?'}
          </h2>
          <p className="mt-1 text-ink/80">
            {canTour
              ? 'The explore tour highlights each part of the app and explains what it does. Skip any step.'
              : 'Create a free account and an explore tour shows you around the app the first time you open it.'}
          </p>
        </div>
        {canTour ? (
          <button type="button" className="btn shrink-0 bg-ink text-white hover:brightness-110" onClick={() => tour?.start()}>
            <Compass size={18} aria-hidden data-anim="spin" /> Take the tour
          </button>
        ) : (
          <Link to={session ? '/' : '/signup'} className="btn shrink-0 bg-ink text-white hover:brightness-110">
            {session ? 'Open the app' : 'Create an account'} <ArrowRight size={18} aria-hidden data-anim="nudge" />
          </Link>
        )}
      </section>

      <nav aria-label="Steps in this guide" className="flex flex-wrap gap-2">
        {STEPS.map((s, i) => (
          <a key={s.id} href={`#${s.id}`} className="chip max-w-full whitespace-normal text-left">
            {i + 1}. {s.title}
          </a>
        ))}
      </nav>

      <ol className="space-y-4">
        {STEPS.map((s, i) => (
          <li key={s.id} id={s.id} className="card scroll-reveal scroll-mt-24 p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-lime text-ink" aria-hidden>
                {s.icon}
                <span className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs font-extrabold text-white ring-2 ring-surface">
                  {i + 1}
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold">
                  <span className="sr-only">Step {i + 1}: </span>
                  {s.title}
                </h2>
                <p className="mt-1 text-fg-2">{s.children}</p>
                {s.demo}
                {s.tip && (
                  <p className="mt-3 flex gap-2 rounded-xl bg-tint p-3 text-sm">
                    <Lightbulb size={16} aria-hidden className="mt-0.5 shrink-0" />
                    <span>{s.tip}</span>
                  </p>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <section className="card scroll-reveal p-5 sm:p-6" aria-labelledby="install-title">
        <h2 id="install-title" className="flex items-center gap-2 text-lg font-bold">
          <Download size={20} aria-hidden /> Install FridgeWise
        </h2>
        <p className="mt-1 text-fg-2">It works in the browser, but installing it gives you an app icon, a full-screen window and (on iPhone) notifications.</p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { d: 'iPhone and iPad', t: 'In Safari, tap Share, then Add to Home Screen.' },
            { d: 'Android', t: 'In Chrome, open the ⋮ menu and tap Install app (or Add to Home screen).' },
            { d: 'Computer', t: 'In Chrome or Edge, click the install icon at the right of the address bar.' },
          ].map((x) => (
            <div key={x.d} className="rounded-xl bg-tint p-3">
              <dt className="font-semibold">{x.d}</dt>
              <dd className="mt-0.5 text-sm text-fg-2">{x.t}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="flex flex-wrap gap-3 pb-4">
        {session ? (
          <>
            <Link to="/scan?type=receipt" className="btn btn-primary">
              <ScanLine size={18} aria-hidden data-anim="pop" /> Scan a receipt
            </Link>
            <Link to="/add" className="btn btn-secondary">
              <Plus size={18} aria-hidden data-anim="turn" /> Add an item
            </Link>
          </>
        ) : (
          <>
            <Link to="/signup" className="btn btn-primary">
              Create your free account <ArrowRight size={18} aria-hidden data-anim="nudge" />
            </Link>
            <Link to="/" className="btn btn-secondary">
              Back to the homepage
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
