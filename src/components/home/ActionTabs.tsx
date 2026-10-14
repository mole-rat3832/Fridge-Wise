import { BellRing, ChartColumn, Check, ChefHat, Clock3, MessageSquareText, RotateCcw, Sparkles, Undo2, type LucideIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useInView } from '../../hooks/useInView';
import { prefersReducedMotion, useTypewriter } from '../../hooks/useTypewriter';
import { formatMoney } from '../../lib/format';
import { CookingLoader } from '../ai-effects';

// "See it in action" on the homepage: four small demos you can play with. All scripted, no AI calls.
type TabId = 'talk' | 'cook' | 'remind' | 'track';
const TABS: Array<{ id: TabId; label: string; icon: LucideIcon; title: string; text: string }> = [
  {
    id: 'talk',
    label: 'Talk',
    icon: MessageSquareText,
    title: 'Just say what happened',
    text: 'Type or say it like you would tell a friend. FridgeWise shows exactly what will change, waits for your OK, and can undo it.',
  },
  {
    id: 'cook',
    label: 'Cook',
    icon: ChefHat,
    title: 'Dinner from what is about to expire',
    text: 'Pick what you want to use up. The AI chef suggests three recipes built around it, and "I made this" updates your kitchen.',
  },
  {
    id: 'remind',
    label: 'Remind',
    icon: BellRing,
    title: 'One nudge in the morning',
    text: 'A single grouped notification before food goes bad, at the start of your day. On your phone or your computer.',
  },
  {
    id: 'track',
    label: 'Track',
    icon: ChartColumn,
    title: 'Watch the waste go down',
    text: 'Every Used and Tossed tap adds up. See food and money saved versus wasted, week by week.',
  },
];

function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString(undefined, { weekday: 'short' });
}

function plusDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// --- Talk ---------------------------------------------------------------------------------
const TALK = [
  { id: 'milk', text: 'I finished the milk', changes: ['2% Milk → used up', '$3.89 saved'] },
  { id: 'spinach', text: 'Threw out the spinach', changes: ['Baby spinach → tossed', 'Counted in your waste stats'] },
  { id: 'yogurt', text: 'Opened the yogurt today', changes: ['Greek yogurt → opened today', `Now keeps until ${plusDays(7)}`] },
] as const;

function Typed({ text }: { text: string }) {
  const shown = useTypewriter(text, true);
  return <>{shown}</>;
}

function TalkDemo({ active }: { active: boolean }) {
  const [pick, setPick] = useState<(typeof TALK)[number] | null>(null);
  const [phase, setPhase] = useState<'typing' | 'preview' | 'done'>('typing');
  const touched = useRef(false);

  useEffect(() => {
    if (!active || touched.current || pick) return;
    const t = window.setTimeout(() => choose(TALK[0], false), prefersReducedMotion() ? 0 : 700);
    return () => window.clearTimeout(t);
  }, [active, pick]);

  useEffect(() => {
    if (!pick || phase !== 'typing') return;
    const t = window.setTimeout(() => setPhase('preview'), prefersReducedMotion() ? 0 : 1100);
    return () => window.clearTimeout(t);
  }, [pick, phase]);

  function choose(t: (typeof TALK)[number], byUser = true) {
    if (byUser) touched.current = true;
    setPick(t);
    setPhase('typing');
  }

  return (
    <div className="space-y-3">
      <div className="flex min-h-12 items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-2">
        <MessageSquareText size={18} className="shrink-0 text-fg-2" aria-hidden />
        <span className="min-w-0 flex-1 text-sm" aria-live="polite">
          {pick ? <Typed key={pick.id} text={pick.text} /> : <span className="text-fg-3">Tell FridgeWise what happened…</span>}
          {pick && phase === 'typing' && <span className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-pulse bg-fg" aria-hidden />}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {TALK.map((t) => (
          <button key={t.id} type="button" className="chip" aria-pressed={pick?.id === t.id} onClick={() => choose(t)}>
            "{t.text}"
          </button>
        ))}
      </div>
      {pick && phase !== 'typing' && (
        <div key={`${pick.id}-${phase}`} className="card p-4 animate-rise">
          {phase === 'preview' ? (
            <>
              <p className="flex items-center gap-1.5 text-sm font-bold">
                <Sparkles size={16} aria-hidden /> Preview: nothing changes until you confirm
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {pick.changes.map((c) => (
                  <li key={c} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden /> {c}
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setPhase('done')}>
                  <Check size={16} aria-hidden data-anim="pop" /> Confirm
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPick(null)}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-lime text-ink animate-pop" aria-hidden>
                  <Check size={16} strokeWidth={3} />
                </span>
                Done. Your kitchen is up to date.
              </p>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPhase('preview')}>
                <Undo2 size={15} aria-hidden data-anim="spin" /> Undo
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Cook ---------------------------------------------------------------------------------
const INGREDIENTS = ['Spinach', 'Chicken', 'Milk', 'Strawberries'] as const;
type Ingredient = (typeof INGREDIENTS)[number];
const RECIPES: Array<{ name: string; minutes: number; uses: Ingredient[] }> = [
  { name: 'Creamy chicken & spinach skillet', minutes: 25, uses: ['Chicken', 'Spinach', 'Milk'] },
  { name: 'Chicken & spinach quesadillas', minutes: 15, uses: ['Chicken', 'Spinach'] },
  { name: 'Spinach & strawberry salad', minutes: 10, uses: ['Spinach', 'Strawberries'] },
  { name: 'Strawberry smoothie', minutes: 5, uses: ['Strawberries', 'Milk'] },
  { name: 'Fluffy pancakes', minutes: 20, uses: ['Milk'] },
  { name: 'Spinach omelette', minutes: 10, uses: ['Spinach', 'Milk'] },
  { name: 'Lemon garlic chicken', minutes: 30, uses: ['Chicken'] },
  { name: 'Strawberry overnight oats', minutes: 5, uses: ['Strawberries', 'Milk'] },
];

function CookDemo() {
  const [picked, setPicked] = useState<Ingredient[]>(['Spinach', 'Chicken']);
  const [phase, setPhase] = useState<'pick' | 'cooking' | 'ideas'>('pick');
  const ideas = RECIPES.map((r) => ({ ...r, score: r.uses.filter((u) => picked.includes(u)).length }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.minutes - b.minutes)
    .slice(0, 3);

  function cook() {
    setPhase('cooking');
    window.setTimeout(() => setPhase('ideas'), prefersReducedMotion() ? 200 : 2200);
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lime text-ink" aria-hidden>
          <ChefHat size={16} />
        </span>
        <p className="rounded-2xl rounded-tl-sm bg-tint px-3 py-2 text-sm">These expire soonest. Which do you want to use up tonight?</p>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Ingredients to use up">
        {INGREDIENTS.map((i) => {
          const on = picked.includes(i);
          return (
            <button
              key={i}
              type="button"
              className="chip"
              aria-pressed={on}
              disabled={phase === 'cooking'}
              onClick={() => {
                setPicked((p) => (on ? p.filter((x) => x !== i) : [...p, i]));
                setPhase('pick');
              }}
            >
              {on && <Check size={14} aria-hidden />} {i}
            </button>
          );
        })}
      </div>
      {phase === 'pick' && (
        <button type="button" className="btn btn-primary" onClick={cook} disabled={picked.length === 0}>
          <Sparkles size={18} aria-hidden data-anim="pop" /> Get 3 ideas
        </button>
      )}
      {phase === 'cooking' && <CookingLoader ingredients={picked} />}
      {phase === 'ideas' && (
        <div className="space-y-2">
          <ul className="grid gap-2 sm:grid-cols-3">
            {ideas.map((r, i) => (
              <li key={r.name} className="card reveal-card p-3" style={{ ['--fw-delay' as string]: `${i * 120}ms` }}>
                <p className="font-bold leading-snug">{r.name}</p>
                <p className="mt-1 flex items-center gap-1 text-xs text-fg-2">
                  <Clock3 size={12} aria-hidden /> {r.minutes} min
                </p>
                <p className="mt-2 flex flex-wrap gap-1">
                  {r.uses.map((u) => (
                    <span key={u} className={`badge ${picked.includes(u) ? 'badge-yellow' : 'badge-neutral'}`}>
                      {u}
                    </span>
                  ))}
                </p>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPhase('pick')}>
            <RotateCcw size={15} aria-hidden data-anim="spin" /> Try other ingredients
          </button>
        </div>
      )}
    </div>
  );
}

// --- Remind -------------------------------------------------------------------------------
function RemindDemo({ active }: { active: boolean }) {
  const [days] = useState(() => ({ today: new Date().toLocaleDateString(undefined, { weekday: 'long' }), soon: inDays(2) }));
  const [time, setTime] = useState('7:59');
  const [shown, setShown] = useState(false);
  const played = useRef(false);

  function play() {
    played.current = true;
    setShown(false);
    setTime('7:59');
    window.setTimeout(
      () => {
        setTime('8:00');
        setShown(true);
      },
      prefersReducedMotion() ? 0 : 900,
    );
  }

  useEffect(() => {
    if (active && !played.current) play();
  }, [active]);

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
      <div className="relative h-64 w-full max-w-[15rem] overflow-clip rounded-[2rem] bg-linear-to-b from-steel to-slate p-3 text-white shadow-xl" aria-live="polite">
        <p className="mt-6 text-center text-xs font-semibold opacity-80">{days.today}</p>
        <p key={time} className="text-center text-5xl font-bold tabular-nums tracking-tight animate-fade-in">
          {time}
        </p>
        {shown && (
          <div className="demo-notify mt-5 rounded-2xl bg-white/90 p-3 text-ink shadow-lg backdrop-blur">
            <p className="flex items-center justify-between text-[11px] font-semibold text-ink/70">
              <span className="flex items-center gap-1.5">
                <img src="/brand/logo-128.png" alt="" width={16} height={16} /> FRIDGEWISE
              </span>
              now
            </p>
            <p className="mt-1 text-sm font-bold">3 things to use soon</p>
            <p className="text-xs text-ink/80">2% Milk (today), Baby spinach (tomorrow), Chicken thighs ({days.soon})</p>
          </div>
        )}
      </div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={play}>
        <RotateCcw size={15} aria-hidden data-anim="spin" /> Replay
      </button>
    </div>
  );
}

// --- Track --------------------------------------------------------------------------------
const WEEKS = [
  { label: 'Sep 1', used: 4, tossed: 3 },
  { label: 'Sep 8', used: 6, tossed: 3 },
  { label: 'Sep 15', used: 7, tossed: 2 },
  { label: 'Sep 22', used: 8, tossed: 2 },
  { label: 'Sep 29', used: 10, tossed: 1 },
  { label: 'Oct 6', used: 11, tossed: 1 },
];

const rate = (w: (typeof WEEKS)[number]) => Math.round((w.tossed / (w.used + w.tossed)) * 100);

function TrackDemo({ active, locale }: { active: boolean; locale: string }) {
  const max = Math.max(...WEEKS.map((w) => w.used));
  // Bars start at zero and grow once the section is on screen.
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    if (!active) return;
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, [active]);
  return (
    <div>
      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-fg-2">Example household, 6 weeks</p>
      <div className="flex h-44 items-end gap-2 rounded-2xl border border-line bg-surface p-3 sm:gap-3" role="img" aria-label="Bar chart: food used goes up from 4 to 11 items a week while food tossed drops from 3 to 1">
        {WEEKS.map((w, i) => (
          <div key={w.label} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex h-32 w-full items-end justify-center gap-0.5 sm:gap-1">
              <span
                className="w-1/2 max-w-5 rounded-t bg-leaf transition-[height] duration-700 ease-out"
                style={{ height: grown ? `${(w.used / max) * 100}%` : '0%', transitionDelay: `${i * 90}ms` }}
              />
              <span
                className="w-1/2 max-w-5 rounded-t bg-steel transition-[height] duration-700 ease-out"
                style={{ height: grown ? `${(w.tossed / max) * 100}%` : '0%', transitionDelay: `${i * 90 + 45}ms` }}
              />
            </div>
            <span className="text-[10px] text-fg-2">{w.label}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-leaf" aria-hidden /> Used
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-steel" aria-hidden /> Tossed
        </span>
        <span className="ml-auto font-semibold">
          Saved: {formatMoney(15430, locale)} · Waste rate {rate(WEEKS[0])}% → {rate(WEEKS[WEEKS.length - 1])}%
        </span>
      </div>
    </div>
  );
}

export function ActionTabs({ locale }: { locale: string }) {
  const [tab, setTab] = useState<TabId>('talk');
  const [ref, inView] = useInView<HTMLDivElement>(0.3);
  const base = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = TABS.find((t) => t.id === tab)!;

  function onKey(e: KeyboardEvent, i: number) {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (i + dir + TABS.length) % TABS.length;
    setTab(TABS[next].id);
    tabRefs.current[next]?.focus();
  }

  return (
    <div ref={ref} className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-10">
      <div className="min-w-0">
        <div role="tablist" aria-label="Features" className="grid grid-cols-4 gap-1 rounded-2xl bg-tint p-1 lg:flex lg:flex-col">
          {TABS.map((t, i) => {
            const Icon = t.icon;
            const selected = t.id === tab;
            return (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`${base}-tab-${t.id}`}
                aria-selected={selected}
                aria-controls={`${base}-panel`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setTab(t.id)}
                onKeyDown={(e) => onKey(e, i)}
                className={`flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-xs font-semibold transition-colors sm:flex-row sm:gap-2 sm:px-3 sm:text-sm lg:justify-start lg:px-4 lg:py-3 lg:text-left ${
                  selected ? 'bg-surface text-fg shadow-sm' : 'text-fg-2 hover:text-fg'
                }`}
              >
                <Icon size={18} aria-hidden data-anim="pop" />
                <span>{t.label}</span>
                <span className="hidden text-xs font-normal text-fg-2 lg:ml-auto lg:inline">{t.title}</span>
              </button>
            );
          })}
        </div>
        <div key={tab} className="mt-5 animate-fade-in">
          <h3 className="text-2xl font-extrabold tracking-tight">{current.title}</h3>
          <p className="mt-2 text-fg-2">{current.text}</p>
        </div>
      </div>
      <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${tab}`} className="card min-h-[22rem] min-w-0 p-4 sm:p-6">
        <div key={tab} className="animate-fade-in">
          {tab === 'talk' && <TalkDemo active={inView} />}
          {tab === 'cook' && <CookDemo />}
          {tab === 'remind' && <RemindDemo active={inView} />}
          {tab === 'track' && <TrackDemo active={inView} locale={locale} />}
        </div>
      </div>
    </div>
  );
}
