import { Apple, Carrot, Check, Cherry, Croissant, Drumstick, Egg, Milk, Pointer, RotateCcw, Salad, ScanLine, Snowflake, Sparkles, Trash2, Undo2, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { prefersReducedMotion } from '../../hooks/useTypewriter';
import { formatMoney } from '../../lib/format';
import { ScanOverlay } from '../ai-effects';
import { FreshnessBadge } from '../ui';

// A working miniature of the app for the homepage hero. Nothing here talks to the server:
// it's a scripted kitchen that visitors can play with (used / tossed, scan, plain-language updates).
interface DemoItem {
  id: string;
  name: string;
  icon: LucideIcon;
  qty: string;
  days: number;
  where: 'Fridge' | 'Freezer' | 'Pantry';
  cents: number;
  isNew?: boolean;
  flash?: number;
}

const START: DemoItem[] = [
  { id: 'milk', name: '2% Milk', icon: Milk, qty: '1 gal', days: 0, where: 'Fridge', cents: 389 },
  { id: 'spinach', name: 'Baby spinach', icon: Salad, qty: '1 pack', days: 1, where: 'Fridge', cents: 299 },
  { id: 'chicken', name: 'Chicken thighs', icon: Drumstick, qty: '1.5 lb', days: 2, where: 'Fridge', cents: 780 },
  { id: 'apples', name: 'Honeycrisp apples', icon: Apple, qty: '4', days: 9, where: 'Fridge', cents: 399 },
  { id: 'carrots', name: 'Carrots', icon: Carrot, qty: '1 lb', days: 16, where: 'Fridge', cents: 149 },
];
const SCANNED: DemoItem[] = [
  { id: 'berries', name: 'Strawberries', icon: Cherry, qty: '1 lb', days: 3, where: 'Fridge', cents: 449 },
  { id: 'bread', name: 'Sourdough loaf', icon: Croissant, qty: '1', days: 4, where: 'Pantry', cents: 499 },
  { id: 'eggs', name: 'Large eggs', icon: Egg, qty: '12', days: 21, where: 'Fridge', cents: 379 },
];
const COMMANDS = [
  { id: 'half-milk', text: 'I used half the milk', item: 'milk' },
  { id: 'freeze-chicken', text: 'Moved the chicken to the freezer', item: 'chicken' },
] as const;
const PLACEHOLDERS = ['I used half the milk', 'Moved the chicken to the freezer', 'Threw out the spinach', 'Opened the yogurt today'];

const status = (days: number) => (days <= 0 ? 'red' : days <= 2 ? 'yellow' : 'green');
const when = (days: number) => (days < 0 ? 'Expired' : days === 0 ? 'Use today' : days === 1 ? 'Use by tomorrow' : days > 60 ? 'Keeps for months' : `${days} days left`);

export interface DemoStats {
  saved: number;
  wasted: number;
  actions: number;
}

interface Toast {
  id: number;
  text: string;
  undo?: () => void;
}

export function HeroDemo({ onStats, locale }: { onStats?: (s: DemoStats) => void; locale: string }) {
  const [items, setItems] = useState<DemoItem[]>(START);
  const [leaving, setLeaving] = useState<string[]>([]);
  const [stats, setStats] = useState<DemoStats>({ saved: 0, wasted: 0, actions: 0 });
  const [toast, setToast] = useState<Toast | null>(null);
  const [pops, setPops] = useState<Array<{ id: number; text: string; tone: 'good' | 'bad' }>>([]);
  const [scan, setScan] = useState<'idle' | 'scanning' | 'done'>('idle');
  const [used, setUsed] = useState<string[]>([]);
  const [placeholder, setPlaceholder] = useState(0);
  const seq = useRef(0);
  const reduce = useRef(prefersReducedMotion());

  useEffect(() => onStats?.(stats), [stats, onStats]);

  // Cycle example commands in the input, like the real app's hints.
  useEffect(() => {
    if (reduce.current) return;
    const id = window.setInterval(() => setPlaceholder((p) => (p + 1) % PLACEHOLDERS.length), 2600);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const sorted = [...items].sort((a, b) => a.days - b.days);
  const counts = { red: 0, yellow: 0, green: 0 };
  for (const it of items) counts[status(it.days)]++;

  function pop(text: string, tone: 'good' | 'bad') {
    const id = ++seq.current;
    setPops((p) => [...p, { id, text, tone }]);
    window.setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 1400);
  }

  function finish(item: DemoItem, kind: 'used' | 'tossed') {
    setLeaving((l) => [...l, item.id]);
    window.setTimeout(
      () => {
        setItems((list) => list.filter((x) => x.id !== item.id));
        setLeaving((l) => l.filter((x) => x !== item.id));
      },
      reduce.current ? 0 : 280,
    );
    setStats((s) => ({
      saved: s.saved + (kind === 'used' ? item.cents : 0),
      wasted: s.wasted + (kind === 'tossed' ? item.cents : 0),
      actions: s.actions + 1,
    }));
    pop(`${kind === 'used' ? '+' : '−'}${formatMoney(item.cents, locale)}`, kind === 'used' ? 'good' : 'bad');
    setToast({
      id: ++seq.current,
      text: kind === 'used' ? `Nice! ${item.name} used. ${formatMoney(item.cents, locale)} saved.` : `${item.name} tossed. ${formatMoney(item.cents, locale)} wasted.`,
      undo: () => {
        setItems((list) => (list.some((x) => x.id === item.id) ? list : [...list, { ...item, flash: ++seq.current }]));
        setStats((s) => ({
          saved: s.saved - (kind === 'used' ? item.cents : 0),
          wasted: s.wasted - (kind === 'tossed' ? item.cents : 0),
          actions: s.actions + 1,
        }));
        setToast({ id: ++seq.current, text: `Undone. ${item.name} is back.` });
      },
    });
  }

  function startScan() {
    setScan('scanning');
    setStats((s) => ({ ...s, actions: s.actions + 1 }));
    window.setTimeout(
      () => {
        setScan('done');
        setItems((list) => [...list, ...SCANNED.map((x) => ({ ...x, isNew: true, flash: ++seq.current }))]);
        setToast({ id: ++seq.current, text: 'Receipt read: 3 items added with their dates. You can edit anything.' });
      },
      reduce.current ? 400 : 1900,
    );
  }

  function runCommand(cmd: (typeof COMMANDS)[number]) {
    const target = items.find((x) => x.id === cmd.item);
    if (!target) return;
    setUsed((u) => [...u, cmd.id]);
    setStats((s) => ({ ...s, actions: s.actions + 1 }));
    const before = { ...target };
    const after: DemoItem =
      cmd.id === 'half-milk' ? { ...target, qty: '½ gal', flash: ++seq.current } : { ...target, where: 'Freezer', days: 90, flash: ++seq.current };
    setItems((list) => list.map((x) => (x.id === target.id ? after : x)));
    setToast({
      id: ++seq.current,
      text: cmd.id === 'half-milk' ? '2% Milk: 1 gal → ½ gal.' : 'Chicken thighs: Fridge → Freezer. Now keeps for months.',
      undo: () => {
        setItems((list) => list.map((x) => (x.id === before.id ? { ...before, flash: ++seq.current } : x)));
        setUsed((u) => u.filter((x) => x !== cmd.id));
        setToast({ id: ++seq.current, text: 'Undone. Back to how it was.' });
      },
    });
  }

  function reset() {
    setItems(START.map((x) => ({ ...x, flash: ++seq.current })));
    setScan('idle');
    setUsed([]);
    setToast(null);
  }

  const firstId = sorted[0]?.id;
  const showHint = stats.actions === 0;

  return (
    <div className="relative" role="region" aria-label="Interactive demo of FridgeWise">
      {/* Money popping out of the phone after Used / Tossed */}
      <div className="pointer-events-none absolute inset-x-0 top-1/3 z-20" aria-hidden>
        {pops.map((p) => (
          <span
            key={p.id}
            className={`demo-pop-up absolute left-1/2 rounded-full px-3 py-1 text-sm font-extrabold shadow-lg ${p.tone === 'good' ? 'bg-lime text-ink' : 'bg-expired text-white'}`}
          >
            {p.text}
          </span>
        ))}
      </div>

      <div className="rounded-[2.4rem] border border-white/10 bg-ink p-2 shadow-2xl ring-1 ring-black/20">
        <div className="relative flex h-[33rem] flex-col overflow-clip rounded-[1.9rem] bg-bg text-fg sm:h-[35rem]">
          {/* status bar */}
          <div className="flex items-center justify-between px-5 pb-1 pt-3 text-[11px] font-semibold text-fg-2" aria-hidden>
            <span>9:41</span>
            <span className="h-4 w-16 rounded-full bg-ink" />
            <span>100%</span>
          </div>

          <div className="px-4">
            <div className="flex items-end justify-between gap-2">
              <div>
                <p className="text-lg font-extrabold leading-tight">Your kitchen</p>
                <p className="text-xs text-fg-2" aria-live="polite">
                  <strong className="text-fg">{counts.red}</strong> today · <strong className="text-fg">{counts.yellow}</strong> soon ·{' '}
                  <strong className="text-fg">{counts.green}</strong> fresh
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-wide text-fg-2">Saved</p>
                <p className="text-lg font-extrabold tabular-nums leading-tight">{formatMoney(stats.saved, locale)}</p>
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="btn btn-primary btn-sm flex-1 justify-center"
                onClick={startScan}
                disabled={scan !== 'idle'}
              >
                {scan === 'done' ? <Check size={16} aria-hidden /> : <ScanLine size={16} aria-hidden data-anim="pop" />}
                {scan === 'idle' ? 'Scan a receipt' : scan === 'scanning' ? 'Reading…' : 'Receipt added'}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={reset} aria-label="Reset the demo">
                <RotateCcw size={15} aria-hidden data-anim="spin" />
              </button>
            </div>

            {/* plain-language updates */}
            <div className="mt-3 rounded-2xl border border-line p-2">
              <p className="flex items-center gap-1.5 rounded-lg bg-tint px-2.5 py-1.5 text-xs text-fg-3" aria-hidden>
                <Sparkles size={13} />
                <span key={placeholder} className="animate-fade-in truncate">
                  e.g. {PLACEHOLDERS[placeholder]}
                </span>
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {COMMANDS.map((c) => {
                  const done = used.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className="chip min-h-0 px-2.5 py-1 text-[11px]"
                      aria-pressed={done}
                      disabled={done || !items.some((x) => x.id === c.item)}
                      onClick={() => runCommand(c)}
                    >
                      {done && <Check size={12} aria-hidden />} "{c.text}"
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* first-time hint */}
          {showHint && (
            <p className="mx-4 mt-3 flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs font-bold text-white animate-pop dark:bg-white dark:text-ink">
              <Pointer size={14} className="float-loop motion-loop shrink-0" aria-hidden /> Try it: tap ✓ when you use something, or scan the receipt.
            </p>
          )}

          {/* the list */}
          <ul className="mt-3 flex-1 space-y-1.5 overflow-y-auto px-3 pb-20 [scrollbar-width:none]">
            {sorted.map((it) => {
              const Icon = it.icon;
              const st = status(it.days);
              return (
                <li
                  key={`${it.id}-${it.flash ?? 0}`}
                  className={`flex items-center gap-2 rounded-xl border border-line bg-surface px-2.5 py-2 ${leaving.includes(it.id) ? 'demo-leave' : it.flash ? 'demo-flash animate-rise' : ''}`}
                  style={{ borderLeftWidth: 4, borderLeftColor: st === 'red' ? 'var(--color-expired)' : st === 'yellow' ? 'var(--color-lime)' : 'var(--color-sprout)' } as CSSProperties}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tint text-fg-2" aria-hidden>
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-semibold">{it.name}</span>
                      {it.isNew && <span className="rounded bg-lime px-1 text-[9px] font-extrabold uppercase text-ink">New</span>}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-fg-2">
                      <FreshnessBadge status={st}>{when(it.days)}</FreshnessBadge>
                      <span className="inline-flex items-center gap-1">
                        {it.qty} · {it.where === 'Freezer' && <Snowflake size={10} aria-hidden />}
                        {it.where}
                      </span>
                    </span>
                  </span>
                  <span className="relative">
                    {showHint && it.id === firstId && <span className="ready-pulse absolute inset-0 rounded-lg" aria-hidden />}
                    <button
                      type="button"
                      className="btn btn-secondary btn-icon relative min-h-8 min-w-8 p-1"
                      onClick={() => finish(it, 'used')}
                      aria-label={`Mark ${it.name} as used`}
                      disabled={leaving.includes(it.id)}
                    >
                      <Check size={15} aria-hidden data-anim="pop" />
                    </button>
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon min-h-8 min-w-8 p-1 text-fg-2"
                    onClick={() => finish(it, 'tossed')}
                    aria-label={`Mark ${it.name} as tossed`}
                    disabled={leaving.includes(it.id)}
                  >
                    <Trash2 size={15} aria-hidden data-anim="wiggle" />
                  </button>
                </li>
              );
            })}
            {items.length === 0 && (
              <li className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-sm text-fg-2">
                Kitchen cleared! <button type="button" className="font-semibold text-fg underline" onClick={reset}>Restock the demo</button>
              </li>
            )}
          </ul>

          {/* receipt scan */}
          {scan === 'scanning' && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-ink/70 p-6 animate-fade-in" aria-hidden>
              <div className="scan-frame w-48 rotate-[-3deg] bg-white p-4 font-mono text-[10px] leading-relaxed text-ink shadow-2xl">
                <p className="text-center font-bold">FRESH MART</p>
                <p className="text-center">10/14 · #0042</p>
                <p className="mt-2 flex justify-between"><span>STRAWBERRIES 1LB</span><span>4.49</span></p>
                <p className="flex justify-between"><span>SOURDOUGH</span><span>4.99</span></p>
                <p className="flex justify-between"><span>EGGS LG 12CT</span><span>3.79</span></p>
                <p className="flex justify-between"><span>BAG</span><span>0.10</span></p>
                <p className="mt-2 flex justify-between border-t border-dashed border-ink/40 pt-1 font-bold"><span>TOTAL</span><span>13.37</span></p>
                <ScanOverlay />
              </div>
            </div>
          )}

          {/* toast */}
          <div className="absolute inset-x-3 bottom-3 z-20" aria-live="polite">
            {toast && (
              <div key={toast.id} className="flex items-center gap-2 rounded-2xl bg-ink px-3 py-2.5 text-xs text-white shadow-xl animate-toast-in dark:bg-white dark:text-ink">
                <span className="min-w-0 flex-1">{toast.text}</span>
                {toast.undo && (
                  <button type="button" className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 font-bold text-lime underline-offset-2 hover:underline dark:text-ink" onClick={toast.undo}>
                    <Undo2 size={13} aria-hidden /> Undo
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
