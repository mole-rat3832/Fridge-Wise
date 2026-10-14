import {
  ArrowRight,
  BellRing,
  BookOpen,
  CalendarClock,
  Camera,
  ChefHat,
  ChevronDown,
  Gauge,
  Lock,
  MessageSquareText,
  PiggyBank,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Undo2,
} from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FreshnessBadge } from '../components/ui';
import { useAuth } from '../state/auth';

// The public homepage: what FridgeWise is, why it exists and how it works (the README, for people).
const SOURCE_URL = 'https://news.un.org/en/node/1148036';

function Section({
  id,
  eyebrow,
  title,
  intro,
  children,
  tint,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
  tint?: boolean;
}) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className={tint ? 'bg-tint' : undefined}>
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="scroll-reveal max-w-2xl">
          {eyebrow && <p className="text-sm font-bold uppercase tracking-wide text-fg-2">{eyebrow}</p>}
          <h2 id={id ? `${id}-title` : undefined} className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">
            {title}
          </h2>
          {intro && <p className="mt-3 text-lg text-fg-2">{intro}</p>}
        </div>
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

function Feature({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="card scroll-reveal p-5">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-lime text-ink" aria-hidden>
        {icon}
      </span>
      <h3 className="mt-4 text-lg font-bold">{title}</h3>
      <p className="mt-1 text-fg-2">{children}</p>
    </li>
  );
}

function Hero() {
  const { session } = useAuth();
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60rem_30rem_at_85%_-10%,color-mix(in_srgb,var(--color-lime)_35%,transparent),transparent_70%),radial-gradient(40rem_24rem_at_-10%_110%,color-mix(in_srgb,var(--color-leaf)_25%,transparent),transparent_70%)]" />
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-sm font-semibold text-fg-2 animate-rise">
            <Sparkles size={16} aria-hidden className="text-fg" /> Beta · Built for a school AI competition
          </p>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight animate-rise [animation-delay:80ms] sm:text-5xl lg:text-6xl">
            Use the food you buy <span className="bg-lime px-1.5 text-ink [box-decoration-break:clone]">before it goes bad.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-fg-2 animate-rise [animation-delay:160ms]">
            FridgeWise keeps track of the food you have at home. Snap a grocery receipt and AI fills in the items and expiration dates. Then the app shows what
            to use first, reminds you before anything expires and suggests recipes for what is left.
          </p>
          <div className="mt-7 flex flex-wrap gap-3 animate-rise [animation-delay:240ms]">
            {session ? (
              <Link to="/" className="btn btn-primary">
                Open your kitchen <ArrowRight size={18} aria-hidden data-anim="nudge" />
              </Link>
            ) : (
              <Link to="/signup" className="btn btn-primary">
                Get started, it's free <ArrowRight size={18} aria-hidden data-anim="nudge" />
              </Link>
            )}
            <Link to="/guide" className="btn btn-secondary">
              <BookOpen size={18} aria-hidden data-anim="wiggle" /> See how it works
            </Link>
          </div>
          <p className="mt-4 text-sm text-fg-2 animate-rise [animation-delay:320ms]">
            Works on phones, tablets and computers, and installs to your home screen like an app.
            {!session && (
              <>
                {' '}
                Already have an account?{' '}
                <Link to="/signin" className="font-semibold text-fg underline underline-offset-2">
                  Sign in
                </Link>
                .
              </>
            )}
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-[22rem] animate-rise [animation-delay:200ms]" aria-hidden>
          <div className="rounded-[2.4rem] border border-line bg-ink p-2.5 shadow-2xl">
            <img
              src="/screenshots/dashboard-narrow.webp"
              width={720}
              height={1560}
              alt=""
              fetchPriority="high"
              className="h-auto w-full rounded-[1.9rem] bg-white"
            />
          </div>
          <div className="float-loop motion-loop absolute -left-6 top-[46%] sm:-left-14">
            <div className="card flex items-center gap-2 px-3 py-2 text-sm font-semibold shadow-lg">
              Milk <FreshnessBadge status="red" />
            </div>
          </div>
          <div className="float-loop motion-loop absolute -right-4 top-[21%] [animation-delay:-2s] sm:-right-12">
            <div className="card flex items-center gap-2 px-3 py-2 text-sm font-semibold shadow-lg">
              Spinach <FreshnessBadge status="yellow" />
            </div>
          </div>
          <div className="float-loop motion-loop absolute -left-4 bottom-24 [animation-delay:-4s] sm:-left-16">
            <div className="card max-w-[15rem] px-3 py-2 text-sm shadow-lg">
              <p className="flex items-center gap-1.5 font-semibold">
                <MessageSquareText size={15} /> "I used half the milk"
              </p>
              <p className="mt-0.5 text-fg-2">Milk: 1 L → 0.5 L · Confirm?</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const FAQ: Array<{ q: string; a: ReactNode }> = [
  {
    q: 'Is FridgeWise free?',
    a: 'Yes. It is a beta built for a school AI competition. To keep it free, each account gets 40 scans and 60 AI requests a day.',
  },
  {
    q: 'When do the daily limits reset?',
    a: 'At midnight in your timezone, which you can change in Settings. The sidebar and Settings show how many scans and AI requests you have left; hover over a bar to see the exact reset time.',
  },
  {
    q: 'Which devices does it work on?',
    a: 'Any modern browser on Android, iPhone and iPad, Windows, macOS and Linux. You can install it to your home screen or desktop like an app.',
  },
  {
    q: 'Why am I not getting notifications on my iPhone?',
    a: 'Apple only allows web notifications for apps added to the Home Screen, on iOS 16.4 or later. Open FridgeWise in Safari, tap Share, then Add to Home Screen, and turn on reminders from the installed app.',
  },
  {
    q: 'Does it work offline?',
    a: 'The app opens without a connection and shows your last saved list, and the "Do I have it?" shopping check works offline. Scanning, AI and changes need a connection.',
  },
  {
    q: 'Which AI does it use?',
    a: 'Google Gemini, called only from the server, never from your browser. It reads receipts and labels, understands plain-language updates and suggests recipes.',
  },
  {
    q: 'Are the expiration dates exact?',
    a: 'FridgeWise uses the date printed on the package when there is one. Otherwise it estimates from the USDA FoodKeeper shelf-life table, then asks the AI. Estimates are a guide: always trust the package and your senses.',
  },
];

export function Home() {
  const { session } = useAuth();
  useEffect(() => {
    document.title = 'FridgeWise: use the food you buy before it goes bad';
    return () => {
      document.title = 'FridgeWise';
    };
  }, []);

  return (
    <>
      <Hero />

      <Section
        id="why"
        eyebrow="Why it matters"
        title="Most wasted food is thrown away at home"
        intro="Not on purpose: it gets forgotten at the back of the fridge, or bought twice. FridgeWise makes sure you know what you have and when to use it."
        tint
      >
        <ul className="grid gap-4 sm:grid-cols-3">
          {[
            { big: '1.05 billion t', text: 'of food was wasted in 2022, about a fifth of all the food available to consumers.' },
            { big: '60%', text: 'of that waste happened in households, more than shops and restaurants combined.' },
            { big: '79 kg', text: 'of food is wasted at home per person, every year, on average.' },
          ].map((s) => (
            <li key={s.big} className="card scroll-reveal p-5">
              <p className="text-3xl font-extrabold tracking-tight sm:text-4xl">{s.big}</p>
              <p className="mt-1 text-fg-2">{s.text}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-fg-2">
          Source:{' '}
          <a href={SOURCE_URL} className="font-semibold underline underline-offset-2" rel="noopener">
            UNEP Food Waste Index Report 2024
          </a>
          .
        </p>
      </Section>

      <Section id="how" eyebrow="How it works" title="Three steps, a few seconds each">
        <ol className="grid gap-4 md:grid-cols-3">
          {[
            {
              icon: <Camera size={22} />,
              title: 'Add your food',
              text: 'Scan a grocery receipt or a single product, or type it in. AI reads the names and dates, and you check every line before it is saved.',
            },
            {
              icon: <CalendarClock size={22} />,
              title: 'See what to use first',
              text: 'Everything is sorted into Use today, Use soon and Fresh. One morning reminder arrives before anything expires.',
            },
            {
              icon: <ChefHat size={22} />,
              title: 'Use it up',
              text: 'Get recipes for what expires soonest, update your list in plain words, and watch the money you save add up.',
            },
          ].map((s, i) => (
            <li key={s.title} className="card scroll-reveal relative p-5">
              <span className="absolute right-4 top-3 text-5xl font-extrabold text-fg/10" aria-hidden>
                {i + 1}
              </span>
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-on-accent" aria-hidden>
                {s.icon}
              </span>
              <h3 className="mt-4 text-lg font-bold">
                <span className="sr-only">Step {i + 1}: </span>
                {s.title}
              </h3>
              <p className="mt-1 text-fg-2">{s.text}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6">
          <Link to="/guide" className="btn btn-secondary">
            <BookOpen size={18} aria-hidden data-anim="wiggle" /> Read the step-by-step guide
          </Link>
        </p>
      </Section>

      <Section id="features" eyebrow="Features" title="Everything you need to waste less" tint>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Feature icon={<Camera size={22} />} title="Scan receipts and products">
            Phone camera, desktop webcam, a file or drag and drop. Unsure fields are marked "Check this", and bags or tax lines start unchecked.
          </Feature>
          <Feature icon={<CalendarClock size={22} />} title="Dates you can trust">
            The printed date first, then the USDA FoodKeeper table, then an AI estimate. Moving food to the freezer or opening it updates the date.
          </Feature>
          <Feature icon={<MessageSquareText size={22} />} title="Just say what happened">
            Type or say "I used half the milk" or "moved the chicken to the freezer". Preview, confirm, and undo if you change your mind.
          </Feature>
          <Feature icon={<ChefHat size={22} />} title="Chat with the AI chef">
            Talk about cravings, diet, allergies and time, then get three recipes built around what expires soonest. "I made this" updates your list.
          </Feature>
          <Feature icon={<BellRing size={22} />} title="Morning reminders">
            One grouped notification in your morning before food expires, on your phone or computer.
          </Feature>
          <Feature icon={<ShoppingCart size={22} />} title="Do I have it?">
            At the store, check what is already at home before buying it again. Works offline from your last saved list.
          </Feature>
          <Feature icon={<PiggyBank size={22} />} title="See what you saved">
            Food used versus thrown away, and money saved versus wasted, by week and all-time.
          </Feature>
          <Feature icon={<Smartphone size={22} />} title="Works everywhere">
            Install it on any device. Light and dark themes, accent colors, larger text, high contrast and reduced motion.
          </Feature>
        </ul>
      </Section>

      <Section
        id="ai"
        eyebrow="AI you stay in charge of"
        title="The AI suggests. You decide."
        intro="FridgeWise uses AI where it saves you typing, and never lets it change your food behind your back."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <ul className="card scroll-reveal space-y-4 p-5 sm:p-6">
            {[
              { icon: <ShieldCheck size={20} />, text: 'Nothing is saved until you confirm. Every scan and every change is shown to you first.' },
              { icon: <Undo2 size={20} />, text: 'Every AI change is logged field by field, and one tap undoes it.' },
              { icon: <Lock size={20} />, text: 'Fields you edit yourself are locked, so the AI never overwrites them.' },
              { icon: <Sparkles size={20} />, text: 'Text printed in photos is treated as data, never as instructions to the AI.' },
              {
                icon: <Gauge size={20} />,
                text: 'Daily limits of 40 scans and 60 AI requests keep it fair and free. They reset at midnight in your timezone.',
              },
            ].map((r) => (
              <li key={r.text} className="flex gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-tint" aria-hidden>
                  {r.icon}
                </span>
                <span>{r.text}</span>
              </li>
            ))}
          </ul>
          <div className="card scroll-reveal p-5 sm:p-6">
            <h3 className="flex items-center gap-2 text-lg font-bold">
              <Lock size={20} aria-hidden /> Your data stays yours
            </h3>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-fg-2 marker:text-fg-3">
              <li>Each account can only read and change its own food. The database enforces it with row-level security.</li>
              <li>Scan photos are stored privately and deleted after 30 days.</li>
              <li>Export your items and change history as CSV files at any time.</li>
              <li>Delete your account in Settings and all of your data goes with it.</li>
              <li>Sign-up and sign-in are protected from bots by Cloudflare Turnstile.</li>
            </ul>
          </div>
        </div>
      </Section>

      <Section id="faq" eyebrow="Questions" title="Frequently asked questions" tint>
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

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="card scroll-reveal flex flex-col items-start gap-5 bg-ink p-6 text-white sm:p-10 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Ready to waste less?</h2>
            <p className="mt-2 max-w-xl text-white/80">Create an account in under a minute, then scan your next grocery receipt.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to={session ? '/' : '/signup'} className="btn bg-lime text-ink hover:brightness-95">
              {session ? 'Open your kitchen' : 'Create your free account'} <ArrowRight size={18} aria-hidden data-anim="nudge" />
            </Link>
            <Link to="/guide" className="btn border border-white/40 text-white hover:bg-white/10">
              Read the guide
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
