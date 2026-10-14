import { ArrowRight, Scale, Users, Wallet } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useCountUp, useInView } from '../../hooks/useInView';
import { currencyFor } from '../../lib/format';

// Homepage "what is your waste costing you" calculator. The money estimate only uses the visitor's
// own numbers; the weight uses UNEP's average of 79 kg of food wasted per person per year at home.
const KG_PER_PERSON = 79;

function Slider({
  label,
  icon,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  icon: ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="flex items-center gap-2 font-semibold">
          {icon}
          {label}
        </label>
        <output htmlFor={id} className="rounded-lg bg-tint px-2 py-0.5 text-sm font-bold tabular-nums">
          {display}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full accent-[var(--fw-accent)]"
        style={{ background: `linear-gradient(to right, var(--fw-accent) ${pct}%, var(--fw-tint) ${pct}%)` }}
      />
    </div>
  );
}

export function SavingsCalculator({ locale, signedIn }: { locale: string; signedIn: boolean }) {
  const [people, setPeople] = useState(2);
  const [spend, setSpend] = useState(120);
  const [share, setShare] = useState(15);
  const [ref, inView] = useInView<HTMLDivElement>(0.3);
  const yearly = Math.round(spend * 52 * (share / 100) * 100); // cents
  const kg = people * KG_PER_PERSON;
  const money = useCountUp(yearly, inView);
  const weight = useCountUp(kg, inView);
  const currency = currencyFor(locale);
  const money0 = (n: number) => new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

  return (
    <div ref={ref} className="grid gap-6 lg:grid-cols-2 lg:items-center">
      <div className="card min-w-0 space-y-6 p-5 sm:p-6">
        <Slider label="People at home" icon={<Users size={18} aria-hidden />} value={people} min={1} max={8} step={1} display={String(people)} onChange={setPeople} />
        <Slider
          label="Groceries per week"
          icon={<Wallet size={18} aria-hidden />}
          value={spend}
          min={20}
          max={400}
          step={5}
          display={money0(spend)}
          onChange={setSpend}
        />
        <Slider
          label="How much ends up in the bin"
          icon={<Scale size={18} aria-hidden />}
          value={share}
          min={5}
          max={40}
          step={1}
          display={`${share}%`}
          onChange={setShare}
        />
        <p className="text-xs text-fg-2">Your guess is fine. Most people underestimate it.</p>
      </div>

      <div className="relative min-w-0 overflow-clip rounded-[var(--radius-card)] bg-ink p-6 text-white sm:p-8">
        <div className="demo-drift pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-lime/30 blur-3xl" aria-hidden />
        <p className="relative text-sm font-bold uppercase tracking-wide text-white/70">Thrown away each year</p>
        <p className="relative mt-1 text-5xl font-extrabold tabular-nums tracking-tight sm:text-6xl" aria-live="polite">
          {money0(money / 100)}
        </p>
        <p className="relative mt-2 text-white/80">
          and about <strong className="text-white tabular-nums">{Math.round(weight)} kg</strong> of food, if your home is like the global average (UNEP 2024).
        </p>
        <p className="relative mt-5 text-lg font-semibold">FridgeWise reminds you before it expires and turns leftovers into dinner.</p>
        <Link to={signedIn ? '/' : '/signup'} className="btn relative mt-5 bg-lime text-ink hover:brightness-95">
          {signedIn ? 'Open your kitchen' : 'Start saving, free'} <ArrowRight size={18} aria-hidden data-anim="nudge" />
        </Link>
      </div>
    </div>
  );
}
