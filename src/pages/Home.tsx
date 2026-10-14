import {
  ArrowRight,
  BookOpen,
  Camera,
  ChefHat,
  ChevronDown,
  Download,
  FileClock,
  Gauge,
  Lock,
  MousePointerClick,
  Palette,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Undo2,
  UserPlus,
  WifiOff,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { ActionTabs } from '../components/home/ActionTabs';
import { HeroDemo, type DemoStats } from '../components/home/HeroDemo';
import { SavingsCalculator } from '../components/home/SavingsCalculator';
import { useCountUp, useInView } from '../hooks/useInView';
import { prefersReducedMotion } from '../hooks/useTypewriter';
import { formatMoney } from '../lib/format';
import { useAuth } from '../state/auth';

// The public homepage. Built to be played with: a working mini kitchen in the hero, demos you
// can tap through, and a calculator, so visitors feel the app before they sign up.
const SOURCE_URL = 'https://news.un.org/en/node/1148036';

function Section({ id, eyebrow, title, intro, children, tint }: { id?: string; eyebrow?: string; title: string; intro?: ReactNode; children: ReactNode; tint?: boolean }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className={`scroll-mt-16 ${tint ? 'bg-tint' : ''}`}>
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="scroll-reveal max-w-2xl">
          {eyebrow && <p className="text-sm font-bold uppercase tracking-wide text-fg-2">{eyebrow}</p>}
          <h2 id={id ? `${id}-title` : undefined} className="mt-1 text-[1.75rem] font-extrabold leading-tight tracking-tight sm:text-4xl">
            {title}
          </h2>
          {intro && <p className="mt-3 text-lg text-fg-2">{intro}</p>}
        </div>
        <div className="mt-8 sm:mt-10">{children}</div>
      </div>
    </section>
  );
}

function CtaButton({ signedIn, className = '', label }: { signedIn: boolean; className?: string; label?: string }) {
  return (
    <Link to={signedIn ? '/' : '/signup'} className={`btn btn-primary group min-h-12 px-5 text-base ${className}`}>
      {signedIn ? 'Open your kitchen' : (label ?? 'Start free')}
      <ArrowRight size={18} aria-hidden className="transition-transform group-hover:translate-x-1" />
    </Link>
  );
}

function Hero({ signedIn, locale, heroRef }: { signedIn: boolean; locale: string; heroRef: RefObject<HTMLElement | null> }) {
  const [stats, setStats] = useState<DemoStats>({ saved: 0, wasted: 0, actions: 0 });
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const canTilt = useRef(false);
  useEffect(() => {
    canTilt.current = window.matchMedia('(pointer: fine) and (min-width: 1024px)').matches && !prefersReducedMotion();
  }, []);
  const onStats = useCallback((s: DemoStats) => setStats(s), []);

  function onMove(e: PointerEvent<HTMLElement>) {
    if (!canTilt.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    setTilt({ x: ((e.clientX - r.left) / r.width - 0.5) * 2, y: ((e.clientY - r.top) / r.height - 0.5) * 2 });
  }

  function toDemo() {
    document.getElementById('demo')?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
  }

  return (
    <section ref={heroRef} className="relative isolate overflow-clip" onPointerMove={onMove} onPointerLeave={() => setTilt({ x: 0, y: 0 })}>
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div className="demo-drift absolute -right-24 -top-32 h-[28rem] w-[28rem] rounded-full bg-lime/30 blur-3xl" />
        <div className="demo-drift absolute -bottom-40 -left-24 h-[24rem] w-[24rem] rounded-full bg-leaf/25 blur-3xl [animation-delay:-7s]" />
        <div className="absolute inset-0 opacity-[0.35] [background-image:radial-gradient(var(--fw-line)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
      </div>

      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-14 pt-8 sm:px-6 sm:pt-12 lg:grid-cols-[1fr_22rem] lg:gap-16 lg:pb-20 lg:pt-16">
        <div className="min-w-0 max-w-xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/80 px-3 py-1 text-xs font-semibold text-fg-2 backdrop-blur animate-rise sm:text-sm">
            <Sparkles size={15} aria-hidden className="text-fg" /> Free beta · Built for a school AI competition
          </p>
          <h1 className="mt-5 text-[2.4rem] font-extrabold leading-[1.04] tracking-tight animate-rise [animation-delay:80ms] sm:text-5xl lg:text-[3.5rem]">
            Use the food you buy <span className="rounded-lg bg-lime px-1.5 text-ink [-webkit-box-decoration-break:clone] [box-decoration-break:clone]">before it goes bad.</span>
          </h1>
          <p className="mt-5 text-lg text-fg-2 animate-rise [animation-delay:160ms] sm:text-xl">
            Snap a grocery receipt and FridgeWise tracks every item, warns you before anything expires and turns what is left into dinner ideas.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3 animate-rise [animation-delay:240ms]">
            <CtaButton signedIn={signedIn} label="Start free, it takes a minute" />
            <button type="button" className="btn btn-secondary min-h-12 px-5 text-base lg:hidden" onClick={toDemo}>
              <MousePointerClick size={18} aria-hidden data-anim="pop" /> Try the live demo
            </button>
          </div>
          {!signedIn && (
            <p className="mt-3 text-sm text-fg-2 animate-rise [animation-delay:300ms]">
              Already have an account?{' '}
              <Link to="/signin" className="font-semibold text-fg underline underline-offset-2">
                Sign in
              </Link>
            </p>
          )}

          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-fg-2 animate-rise [animation-delay:340ms]">
            {(
              [
                [ShieldCheck, 'No ads or trackers'],
                [Smartphone, 'Phone, tablet and computer'],
                [WifiOff, 'Opens offline'],
              ] as const
            ).map(([Icon, text]) => (
              <li key={text} className="flex items-center gap-1.5">
                <Icon size={16} aria-hidden className="text-fg" /> {text}
              </li>
            ))}
          </ul>

          {/* The hook: once someone plays with the demo, show what they just did. */}
          <div className="mt-6 lg:min-h-[5.5rem]" aria-live="polite">
            {stats.actions > 0 ? (
              <div key={stats.saved > 0 ? 'saved' : 'played'} className="card flex flex-wrap items-center gap-3 border-accent p-4 shadow-lg animate-pop">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-lime text-ink" aria-hidden>
                  <Sparkles size={20} />
                </span>
                <p className="min-w-0 flex-1 text-sm">
                  {stats.saved > 0 ? (
                    <>
                      <strong className="text-base">You just saved {formatMoney(stats.saved, locale)}</strong> in a few taps of a demo. Imagine your real kitchen,
                      every week.
                    </>
                  ) : (
                    <>
                      <strong className="text-base">That's FridgeWise.</strong> Your real kitchen works just like this, with reminders and recipes on top.
                    </>
                  )}
                </p>
                <CtaButton signedIn={signedIn} label="Save it for real" className="min-h-11 text-sm" />
              </div>
            ) : (
              <p className="hidden items-center gap-2 text-sm text-fg-2 lg:flex">
                <MousePointerClick size={16} aria-hidden className="float-loop motion-loop" /> The phone is live. Tap ✓, scan the receipt or try a command.
              </p>
            )}
          </div>
        </div>

        <div id="demo" className="relative mx-auto w-full max-w-[21rem] scroll-mt-24 animate-rise [animation-delay:200ms] [perspective:1400px] lg:max-w-none">
          <div className="transition-transform duration-300 ease-out" style={{ transform: `rotateY(${tilt.x * 5}deg) rotateX(${-tilt.y * 4}deg)` }}>
            <HeroDemo onStats={onStats} locale={locale} />
          </div>
          <p className="pointer-events-none absolute -top-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-ink px-3 py-1 text-xs font-bold text-white shadow-lg dark:bg-white dark:text-ink" aria-hidden>
            <span className="relative flex h-2 w-2">
              <span className="motion-loop absolute inline-flex h-full w-full animate-ping rounded-full bg-lime opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-lime" />
            </span>
            Live demo, try it
          </p>
        </div>
      </div>
    </section>
  );
}

function StatsBand() {
  const [ref, inView] = useInView<HTMLDivElement>(0.4);
  const tonnes = useCountUp(1.05, inView, 1100);
  const share = useCountUp(60, inView, 1100);
  const kg = useCountUp(79, inView, 1100);
  const stats = [
    { big: `${tonnes.toFixed(2)} billion t`, text: 'of food wasted in 2022, about a fifth of all food available to consumers' },
    { big: `${Math.round(share)}%`, text: 'of it thrown away at home, more than shops and restaurants combined' },
    { big: `${Math.round(kg)} kg`, text: 'wasted per person every year at home, on average' },
  ];
  return (
    <section aria-labelledby="why-title" className="bg-ink text-white">
      <div ref={ref} className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-14">
        <h2 id="why-title" className="max-w-2xl text-2xl font-extrabold tracking-tight sm:text-3xl">
          Most wasted food is thrown away at home. Usually because it was forgotten.
        </h2>
        <ul className="mt-8 grid gap-6 sm:grid-cols-3">
          {stats.map((s) => (
            <li key={s.text} className="border-l-2 border-lime pl-4">
              <p className="text-3xl font-extrabold tabular-nums tracking-tight text-lime sm:text-4xl">{s.big}</p>
              <p className="mt-1 text-white/80">{s.text}</p>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-white/70">
          Source:{' '}
          <a href={SOURCE_URL} className="underline underline-offset-2 hover:text-white" rel="noopener">
            UNEP Food Waste Index Report 2024
          </a>
        </p>
      </div>
    </section>
  );
}

function Steps({ signedIn }: { signedIn: boolean }) {
  const steps = [
    { icon: UserPlus, title: 'Create a free account', text: 'Email and password, then three quick questions. About a minute.' },
    { icon: Camera, title: 'Scan your next receipt', text: 'Every item lands in your kitchen with its expiration date. Check it, confirm it.' },
    { icon: ChefHat, title: 'Use it before it goes', text: 'Morning reminders, recipes for what is expiring, and a running total of what you saved.' },
  ];
  return (
    <>
      <ol className="relative grid gap-6 md:grid-cols-3">
        <span className="absolute left-[16.6%] right-[16.6%] top-7 hidden border-t-2 border-dashed border-line md:block" aria-hidden />
        {steps.map((s, i) => {
          const Icon = s.icon;
          return (
            <li key={s.title} className="scroll-reveal relative flex gap-4 md:flex-col md:items-center md:text-center">
              <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent text-on-accent shadow-md">
                <Icon size={24} aria-hidden />
                <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs font-extrabold text-white ring-2 ring-bg">
                  {i + 1}
                </span>
              </span>
              <div>
                <h3 className="text-lg font-bold">
                  <span className="sr-only">Step {i + 1}: </span>
                  {s.title}
                </h3>
                <p className="mt-1 text-fg-2">{s.text}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-8 flex flex-wrap gap-3 md:justify-center">
        <CtaButton signedIn={signedIn} />
        <Link to="/guide" className="btn btn-secondary min-h-12 px-5 text-base">
          <BookOpen size={18} aria-hidden data-anim="wiggle" /> Read the full guide
        </Link>
      </div>
    </>
  );
}

const MORE: Array<[typeof Search, string, string]> = [
  [Search, 'Do I have it?', 'Check your kitchen from the store, even offline'],
  [Undo2, 'Undo anything', 'Every change, AI or yours, can be undone'],
  [FileClock, 'Item history', 'See what changed, when, and who changed it'],
  [Palette, '8 themes, 6 fonts', 'Dark green, Mono, larger text, wider spacing'],
  [Download, 'Your data, exportable', 'Download items and history as CSV'],
  [Smartphone, 'Installs like an app', 'Home screen icon, full screen, notifications'],
  [Gauge, 'Fair daily limits', '40 scans and 60 AI requests a day, free'],
  [Lock, 'Private by design', 'Only you can see your kitchen'],
];

const FAQ: Array<{ q: string; a: string }> = [
  { q: 'Is FridgeWise free?', a: 'Yes. It is a beta built for a school AI competition, with no ads and no payments. To keep it free, each account gets 40 scans and 60 AI requests a day.' },
  {
    q: 'When do the daily limits reset?',
    a: 'At midnight in your timezone, which you can change in Settings. The sidebar and Settings show how many scans and AI requests you have left; hover over a bar to see the exact reset time.',
  },
  { q: 'Which devices does it work on?', a: 'Any modern browser on Android, iPhone and iPad, Windows, macOS and Linux. You can install it to your home screen or desktop like an app.' },
  {
    q: 'Why am I not getting notifications on my iPhone?',
    a: 'Apple only allows web notifications for apps added to the Home Screen, on iOS 16.4 or later. Open FridgeWise in Safari, tap Share, then Add to Home Screen, and turn on reminders from the installed app.',
  },
  { q: 'Does it work offline?', a: 'The app opens without a connection and shows your last saved list, and "Do I have it?" works offline. Scanning, AI and changes need a connection.' },
  {
    q: 'Which AI does it use?',
    a: 'Google Gemini, called only from the server, never from your browser. It reads receipts and labels, understands plain-language updates and suggests recipes. It never changes anything without your OK.',
  },
  {
    q: 'Are the expiration dates exact?',
    a: 'FridgeWise uses the date printed on the package when there is one. Otherwise it estimates from the USDA FoodKeeper shelf-life table, then asks the AI. Estimates are a guide: always trust the package and your senses.',
  },
  {
    q: 'What happens to my data?',
    a: 'Only you can see your kitchen. Scan photos are deleted after 30 days, you can export everything as CSV, and deleting your account removes all of it. The Privacy Policy has the details.',
  },
];

function StickyCta({ show, signedIn }: { show: boolean; signedIn: boolean }) {
  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgb(0_0_0/0.08)] backdrop-blur transition-transform duration-300 lg:hidden ${
        show ? 'translate-y-0' : 'pointer-events-none translate-y-full'
      }`}
      aria-hidden={!show}
      data-testid="sticky-cta"
    >
      <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
        <p className="min-w-0 text-sm">
          <strong className="block">{signedIn ? 'Your kitchen is waiting' : 'Free, takes a minute'}</strong>
          <span className="text-fg-2">{signedIn ? 'Pick up where you left off.' : 'No ads. No payments.'}</span>
        </p>
        <Link to={signedIn ? '/' : '/signup'} className="btn btn-primary shrink-0" tabIndex={show ? 0 : -1}>
          {signedIn ? 'Open app' : 'Start free'} <ArrowRight size={18} aria-hidden />
        </Link>
      </div>
    </div>
  );
}

export function Home() {
  const { session } = useAuth();
  const signedIn = Boolean(session);
  const locale = typeof navigator !== 'undefined' ? navigator.language || 'en-US' : 'en-US';
  const heroRef = useRef<HTMLElement | null>(null);
  const finalRef = useRef<HTMLElement | null>(null);
  const [heroVisible, setHeroVisible] = useState(true);
  const [finalVisible, setFinalVisible] = useState(false);

  useEffect(() => {
    document.title = 'FridgeWise: use the food you buy before it goes bad';
    return () => {
      document.title = 'FridgeWise';
    };
  }, []);

  // Sticky sign-up bar on phones: shown once the hero is scrolled away, hidden at the final call to action.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === heroRef.current) setHeroVisible(e.isIntersecting);
        if (e.target === finalRef.current) setFinalVisible(e.isIntersecting);
      }
    });
    if (heroRef.current) io.observe(heroRef.current);
    if (finalRef.current) io.observe(finalRef.current);
    return () => io.disconnect();
  }, []);

  return (
    <>
      <Hero signedIn={signedIn} locale={locale} heroRef={heroRef} />

      <StatsBand />

      <Section id="features" eyebrow="See it in action" title="Built for real kitchens, not spreadsheets" intro="Tap through it. This is how the app works, minus the sign-up.">
        <ActionTabs locale={locale} />
      </Section>

      <Section
        id="savings"
        tint
        eyebrow="Your kitchen"
        title="What is your food waste costing you?"
        intro="Move the sliders. The money is your own estimate; the weight is the global average for homes."
      >
        <SavingsCalculator locale={locale} signedIn={signedIn} />
      </Section>

      <Section id="how" eyebrow="How it works" title="Up and running in a minute">
        <Steps signedIn={signedIn} />
      </Section>

      <Section id="more" tint eyebrow="And a lot more" title="The details that make it stick">
        <ul className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
          {MORE.map(([Icon, title, text]) => (
            <li key={title} className="card scroll-reveal group flex gap-3 p-4 transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-lg">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-lime text-ink transition-transform group-hover:-rotate-6 group-hover:scale-110"
                aria-hidden
              >
                <Icon size={20} />
              </span>
              <div className="min-w-0">
                <h3 className="font-bold">{title}</h3>
                <p className="text-sm text-fg-2">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="trust" eyebrow="AI you stay in charge of" title="The AI suggests. You decide.">
        <div className="grid gap-4 lg:grid-cols-2">
          <ul className="card scroll-reveal space-y-4 p-5 sm:p-6">
            {(
              [
                [ShieldCheck, 'Nothing is saved until you confirm. Every scan and every change is shown to you first.'],
                [Undo2, 'Every AI change is logged field by field, and one tap undoes it.'],
                [Lock, 'Fields you edit yourself are locked, so the AI never overwrites them.'],
                [Sparkles, 'Text printed in photos is treated as data, never as instructions to the AI.'],
              ] as const
            ).map(([Icon, text]) => (
              <li key={text} className="flex gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-tint" aria-hidden>
                  <Icon size={18} />
                </span>
                <span>{text}</span>
              </li>
            ))}
          </ul>
          <div className="card scroll-reveal p-5 sm:p-6">
            <h3 className="flex items-center gap-2 text-lg font-bold">
              <Lock size={20} aria-hidden /> Your data stays yours
            </h3>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-fg-2 marker:text-fg-3">
              <li>Only you can read or change your kitchen; the database enforces it with row-level security.</li>
              <li>Scan photos are stored privately and deleted after 30 days.</li>
              <li>Export your items and history as CSV, or delete your account and everything in it.</li>
              <li>No ads and no third-party trackers.</li>
            </ul>
            <p className="mt-4 text-sm">
              <Link to="/privacy" className="font-semibold underline underline-offset-2">
                Read the Privacy Policy
              </Link>
            </p>
          </div>
        </div>
      </Section>

      <Section id="faq" tint eyebrow="Questions" title="Frequently asked questions">
        <div className="max-w-3xl space-y-3">
          {FAQ.map((f) => (
            <details key={f.q} className="card group scroll-reveal p-0">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 font-semibold [&::-webkit-details-marker]:hidden">
                {f.q}
                <ChevronDown size={20} aria-hidden className="shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <p className="px-5 pb-4 text-fg-2">{f.a}</p>
            </details>
          ))}
        </div>
      </Section>

      <section ref={finalRef} className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="relative isolate overflow-clip rounded-[calc(var(--radius-card)*1.5)] bg-ink px-6 py-10 text-white sm:px-12 sm:py-14">
          <div className="demo-drift pointer-events-none absolute -right-20 -top-24 -z-10 h-72 w-72 rounded-full bg-lime/30 blur-3xl" aria-hidden />
          <div className="demo-drift pointer-events-none absolute -bottom-28 left-10 -z-10 h-64 w-64 rounded-full bg-leaf/30 blur-3xl [animation-delay:-6s]" aria-hidden />
          <div className="grid items-center gap-6 md:grid-cols-[1fr_auto]">
            <div>
              <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Your fridge, finally under control.</h2>
              <p className="mt-3 max-w-xl text-lg text-white/80">Free, no ads, and ready in a minute. Scan your next grocery receipt and let FridgeWise do the remembering.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to={signedIn ? '/' : '/signup'} className="btn group min-h-12 bg-lime px-6 text-base text-ink hover:brightness-95">
                {signedIn ? 'Open your kitchen' : 'Create your free account'}
                <ArrowRight size={18} aria-hidden className="transition-transform group-hover:translate-x-1" />
              </Link>
              <a href="#demo" className="btn min-h-12 border border-white/40 px-5 text-base text-white hover:bg-white/10">
                Play with the demo
              </a>
            </div>
          </div>
        </div>
      </section>

      <StickyCta show={!heroVisible && !finalVisible} signedIn={signedIn} />
    </>
  );
}
