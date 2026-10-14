// Stats: food and money saved vs. wasted, weekly and all-time (from the user_stats view).
// Charts: one y-axis each, legend + tooltip + table view, "tossed" carries a hatch texture so it
// never relies on color alone (the brand palette has only one chromatic hue for two series).
import { ChartColumn, CircleCheck, Gauge, House, PiggyBank, Sparkles, Table, Trash, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import { EmptyState, ErrorNote, PageHeader, Spinner } from '../components/ui';
import { errorMessage, loadDemoData } from '../lib/api';
import { isDemoAccount } from '../lib/demo';
import { addDays, diffDays, formatDate } from '../lib/dates';
import { formatMoney } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useAuth } from '../state/auth';
import { useItems } from '../state/items';
import type { UserStatsRow } from '../types/app';

const USED = '#6BAA75';
const TOSSED = '#69747C';

function subscribeTheme(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'data-contrast'] });
  return () => obs.disconnect();
}
// Chart colors follow the color theme (Settings > Appearance): read from the CSS variables on <html>.
function themeKey(): string {
  const root = document.documentElement;
  const css = getComputedStyle(root);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return [root.classList.contains('dark') ? '1' : '0', v('--fw-fg-2'), v('--fw-surface'), v('--color-leaf')].join('|');
}
function useChartColors() {
  const [dark, tick, surface, leaf] = useSyncExternalStore(subscribeTheme, themeKey, () => '0|||').split('|');
  const isDark = dark === '1';
  return {
    used: leaf || USED,
    tossed: TOSSED,
    tick: tick || '#545454',
    surface: surface || '#ffffff',
    grid: isDark ? 'rgba(105,116,124,0.35)' : 'rgba(105,116,124,0.25)',
    cursor: isDark ? 'rgba(105,116,124,0.18)' : 'rgba(105,116,124,0.1)',
  };
}

interface WeekPoint {
  week: string;
  label: string;
  used: number;
  tossed: number;
  saved: number;
  wasted: number;
}

function mondayOf(iso: string): string {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(iso, -((day + 6) % 7));
}

function StatTile({ label, value, hint, hero, icon: Icon, delay = 0 }: { label: string; value: string; hint?: string; hero?: boolean; icon: LucideIcon; delay?: number }) {
  return (
    <div className="card p-4 animate-rise" style={{ animationDelay: `${delay}ms` }}>
      <p className="flex items-center gap-2 text-sm font-semibold text-fg-2">
        <span className={`flex items-center justify-center rounded-full ${hero ? 'h-8 w-8 bg-lime text-ink' : 'h-7 w-7 bg-tint text-fg'}`} aria-hidden>
          <Icon size={hero ? 18 : 15} className="animate-pop" style={{ animationDelay: `${delay + 200}ms` }} />
        </span>
        {label}
      </p>
      <p className={`mt-1 font-bold tracking-tight ${hero ? 'text-4xl sm:text-5xl' : 'text-2xl'}`}>{value}</p>
      {hint && <p className="mt-1 text-sm text-fg-2">{hint}</p>}
    </div>
  );
}

function Legend({ items }: { items: Array<{ label: string; color: string; hatch?: boolean }> }) {
  return (
    <ul className="flex flex-wrap gap-4 text-sm text-fg-2">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-2">
          <svg width="14" height="14" aria-hidden>
            <rect width="14" height="14" rx="3" fill={it.color} />
            {it.hatch && <rect width="14" height="14" rx="3" fill="url(#legend-hatch)" />}
          </svg>
          {it.label}
        </li>
      ))}
    </ul>
  );
}

function ChartTooltip({ active, payload, label, money, locale }: TooltipContentProps<number, string> & { money: boolean; locale: string }) {
  const colors = useChartColors();
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-sm shadow-lg">
      <p className="mb-1 text-fg-2">Week of {label}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center gap-2">
          <span className="inline-block h-0.5 w-3" style={{ background: p.dataKey === 'used' || p.dataKey === 'saved' ? colors.used : colors.tossed }} aria-hidden />
          <strong className="tabular-nums">{money ? formatMoney(Number(p.value), locale) : p.value}</strong>
          <span className="text-fg-2">{p.name}</span>
        </p>
      ))}
    </div>
  );
}

function WeeklyChart({
  title,
  data,
  keys,
  money,
  locale,
}: {
  title: string;
  data: WeekPoint[];
  keys: [{ key: 'used' | 'saved'; label: string }, { key: 'tossed' | 'wasted'; label: string }];
  money: boolean;
  locale: string;
}) {
  const { used, tossed, tick, surface, grid, cursor } = useChartColors();
  const [table, setTable] = useState(false);
  const hatchId = `hatch-${keys[1].key}`;

  return (
    <section className="card p-4 sm:p-5" aria-label={title}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">{title}</h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTable((t) => !t)} aria-pressed={table}>
          {table ? <ChartColumn size={16} aria-hidden /> : <Table size={16} aria-hidden />} {table ? 'Show chart' : 'Show table'}
        </button>
      </div>
      <Legend items={[{ label: keys[0].label, color: used }, { label: keys[1].label, color: tossed, hatch: true }]} />
      {table ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-fg-2">
                <th className="py-2 pr-4 font-semibold">Week of</th>
                <th className="py-2 pr-4 text-right font-semibold">{keys[0].label}</th>
                <th className="py-2 text-right font-semibold">{keys[1].label}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.week} className="border-b border-line last:border-0">
                  <td className="py-2 pr-4">{d.label}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{money ? formatMoney(d[keys[0].key], locale) : d[keys[0].key]}</td>
                  <td className="py-2 text-right tabular-nums">{money ? formatMoney(d[keys[1].key], locale) : d[keys[1].key]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-3 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -8 }} barGap={2} barCategoryGap="28%">
              <defs>
                <pattern id={hatchId} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                  <rect width="6" height="6" fill={tossed} />
                  <line x1="0" y1="0" x2="0" y2="6" stroke={surface} strokeWidth="2" strokeOpacity="0.55" />
                </pattern>
              </defs>
              <CartesianGrid vertical={false} stroke={grid} strokeWidth={1} />
              <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: grid }} tick={{ fill: tick, fontSize: 12 }} interval="preserveStartEnd" minTickGap={8} />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={money ? 64 : 40}
                tick={{ fill: tick, fontSize: 12 }}
                tickFormatter={(v: number) => (money ? formatMoney(v, locale).replace(/\.00$/, '') : String(v))}
              />
              <Tooltip
                cursor={{ fill: cursor }}
                content={(props) => <ChartTooltip {...(props as TooltipContentProps<number, string>)} money={money} locale={locale} />}
              />
              <Bar dataKey={keys[0].key} name={keys[0].label} fill={used} radius={[4, 4, 0, 0]} maxBarSize={24} />
              <Bar dataKey={keys[1].key} name={keys[1].label} fill={`url(#${hatchId})`} radius={[4, 4, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

export function Stats() {
  const { today, locale, user } = useAuth();
  const { refresh } = useItems();
  const [rows, setRows] = useState<UserStatsRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);

  async function load() {
    const { data, error: err } = await supabase.from('user_stats').select('*');
    if (err) setError(err.message);
    setRows(data ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  const allTime = rows?.find((r) => r.period === 'all_time');
  const weeks = useMemo<WeekPoint[]>(() => {
    const thisMonday = mondayOf(today);
    const byWeek = new Map((rows ?? []).filter((r) => r.period === 'week' && r.week_start).map((r) => [r.week_start!, r]));
    return Array.from({ length: 8 }, (_, i) => {
      const week = addDays(thisMonday, (i - 7) * 7);
      const r = byWeek.get(week);
      return {
        week,
        label: formatDate(week, locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }),
        used: r?.items_used ?? 0,
        tossed: r?.items_wasted ?? 0,
        saved: Number(r?.money_saved_cents ?? 0),
        wasted: Number(r?.money_wasted_cents ?? 0),
      };
    });
  }, [rows, today, locale]);

  const used = allTime?.items_used ?? 0;
  const tossed = allTime?.items_wasted ?? 0;
  const total = used + tossed;
  const thisWeek = weeks[weeks.length - 1];
  const lastWeek = weeks[weeks.length - 2];
  const firstWeek = rows?.filter((r) => r.period === 'week' && r.week_start).sort((a, b) => a.week_start!.localeCompare(b.week_start!))[0];
  const trackingWeeks = firstWeek?.week_start ? Math.max(1, Math.round(diffDays(today, firstWeek.week_start) / 7)) : 0;

  async function demo() {
    setDemoBusy(true);
    try {
      await loadDemoData();
      await Promise.all([load(), refresh()]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDemoBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Shared hatch pattern for the legend swatches */}
      <svg width="0" height="0" className="absolute" aria-hidden>
        <defs>
          <pattern id="legend-hatch" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="5" stroke="#ffffff" strokeWidth="1.6" strokeOpacity="0.6" />
          </pattern>
        </defs>
      </svg>
      <PageHeader title="Stats" subtitle="What you've used and what went to waste." icon={<ChartColumn size={24} />} />
      {error && <ErrorNote>{error}</ErrorNote>}
      {rows === null ? (
        <div className="flex justify-center py-16">
          <Spinner size={28} />
        </div>
      ) : total === 0 ? (
        <EmptyState
          icon={<ChartColumn size={40} />}
          title="No stats yet"
          actions={
            isDemoAccount(user) ? (
              <button type="button" className="btn btn-secondary" onClick={() => void demo()} disabled={demoBusy}>
                {demoBusy ? <Spinner label="Loading" /> : <Sparkles size={18} aria-hidden data-anim="pop" />} Load demo data
              </button>
            ) : (
              <Link to="/" className="btn btn-secondary">
                <House size={18} aria-hidden data-anim="bounce" /> Go to your food
              </Link>
            )
          }
        >
          Mark items as used or tossed and your savings show up here.
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="col-span-2">
              <StatTile
                hero
                icon={PiggyBank}
                label="Money saved"
                value={formatMoney(Number(allTime?.money_saved_cents ?? 0), locale)}
                hint={`Price of food you used${trackingWeeks ? ` over ${trackingWeeks} week${trackingWeeks === 1 ? '' : 's'}` : ''}`}
              />
            </div>
            <StatTile icon={Wallet} delay={80} label="Money wasted" value={formatMoney(Number(allTime?.money_wasted_cents ?? 0), locale)} hint="Price of food you tossed" />
            <StatTile
              icon={Gauge}
              delay={160}
              label="Waste rate"
              value={`${Math.round((tossed / total) * 100)}%`}
              hint={`${tossed} of ${total} items tossed`}
            />
            <StatTile icon={CircleCheck} delay={240} label="Items used" value={String(used)} hint={thisWeek ? `${thisWeek.used} this week, ${lastWeek?.used ?? 0} last week` : undefined} />
            <StatTile icon={Trash} delay={320} label="Items tossed" value={String(tossed)} hint={thisWeek ? `${thisWeek.tossed} this week, ${lastWeek?.tossed ?? 0} last week` : undefined} />
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            <WeeklyChart title="Items per week" data={weeks} keys={[{ key: 'used', label: 'Used' }, { key: 'tossed', label: 'Tossed' }]} money={false} locale={locale} />
            <WeeklyChart title="Money per week" data={weeks} keys={[{ key: 'saved', label: 'Saved (used)' }, { key: 'wasted', label: 'Wasted (tossed)' }]} money locale={locale} />
          </div>
        </>
      )}
    </div>
  );
}
