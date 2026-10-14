import { ClipboardCheck, Plus, Receipt, Refrigerator, ScanLine, Search, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CommandBar } from '../components/CommandBar';
import { ItemGroup } from '../components/ItemRow';
import { EmptyState, FRESHNESS_LABEL, PageHeader, Spinner } from '../components/ui';
import { useOnline } from '../hooks/useOnline';
import { useUndo } from '../hooks/useUndo';
import { errorMessage, loadDemoData, recordUse, recordWaste } from '../lib/api';
import { CATEGORIES, CATEGORY_LABEL, LOCATION_LABEL, LOCATIONS } from '../lib/catalog';
import { formatDateTime, freshness } from '../lib/dates';
import { searchTokens } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useAuth } from '../state/auth';
import { useItems } from '../state/items';
import { useToast } from '../state/toast';
import type { Category, FoodItem, Freshness, StorageLocation } from '../types/app';

const SECTION_HELP: Record<Freshness, string> = {
  red: 'Expires today or has already expired',
  yellow: 'Expires in the next few days',
  green: 'Plenty of time',
};

const SECTION_ACCENT: Record<Freshness, string> = {
  red: 'border-l-expired',
  yellow: 'border-l-lime',
  green: 'border-l-sprout',
};

function groupByName(items: FoodItem[]): FoodItem[][] {
  const map = new Map<string, FoodItem[]>();
  for (const it of items) {
    const key = it.name.trim().toLowerCase();
    map.set(key, [...(map.get(key) ?? []), it]);
  }
  return [...map.values()];
}

export function Dashboard() {
  const { profile, today, locale, timeZone } = useAuth();
  const { items, loading, cachedAt, refresh } = useItems();
  const online = useOnline();
  const toast = useToast();
  const undo = useUndo();
  const [params] = useSearchParams();
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState<'all' | StorageLocation>('all');
  const [category, setCategory] = useState<'all' | Category>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingScans, setPendingScans] = useState(0);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const soonRef = useRef<HTMLElement>(null);
  const rdb = profile?.reminder_days_before ?? 2;

  useEffect(() => {
    void supabase
      .from('scans')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'needs_review')
      .then(({ count }) => setPendingScans(count ?? 0));
  }, []);

  // Opening a reminder notification lands on /?status=soon.
  useEffect(() => {
    if (params.get('status') === 'soon' && !loading) soonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [params, loading]);

  const batchCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) m.set(it.name.trim().toLowerCase(), (m.get(it.name.trim().toLowerCase()) ?? 0) + 1);
    return m;
  }, [items]);

  const counts = useMemo(() => {
    const c = { red: 0, yellow: 0, green: 0 };
    for (const it of items) c[freshness(it.expiration_date, today, rdb)]++;
    return c;
  }, [items, today, rdb]);

  const sections = useMemo(() => {
    const tokens = searchTokens(query);
    const filtered = items.filter((it) => {
      if (location !== 'all' && it.storage_location !== location) return false;
      if (category !== 'all' && it.category !== category) return false;
      if (tokens.length) {
        const hay = searchTokens(`${it.name} ${it.brand ?? ''} ${CATEGORY_LABEL[it.category]}`).join(' ');
        if (!tokens.every((t) => hay.includes(t))) return false;
      }
      return true;
    });
    const by: Record<Freshness, FoodItem[]> = { red: [], yellow: [], green: [] };
    for (const it of filtered) by[freshness(it.expiration_date, today, rdb)].push(it);
    return (['red', 'yellow', 'green'] as const).map((status) => ({ status, groups: groupByName(by[status]), count: by[status].length }));
  }, [items, query, location, category, today, rdb]);

  async function quick(item: FoodItem, kind: 'used' | 'tossed') {
    setBusyId(item.id);
    try {
      const res = kind === 'used' ? await recordUse(item.id) : await recordWaste(item.id);
      await refresh();
      toast.show(kind === 'used' ? `Nice! ${item.name} marked as used.` : `${item.name} marked as tossed.`, {
        tone: 'success',
        action: { label: 'Undo', onClick: () => undo(res.batch_id) },
      });
    } catch (err) {
      toast.show(errorMessage(err), { tone: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  async function demo() {
    setLoadingDemo(true);
    try {
      const r = await loadDemoData();
      await refresh();
      toast.show(`Loaded ${r.active_items} demo items and some history for Stats.`, { tone: 'success' });
    } catch (err) {
      toast.show(errorMessage(err), { tone: 'error' });
    } finally {
      setLoadingDemo(false);
    }
  }

  const greeting = profile?.display_name ? `Hi, ${profile.display_name}` : 'Your kitchen';
  const filtersActive = query || location !== 'all' || category !== 'all';

  return (
    <div className="space-y-5">
      <PageHeader
        title={greeting}
        subtitle={
          items.length === 0 && !loading ? (
            'Add food to start tracking it.'
          ) : (
            <span>
              <strong className="text-fg">{counts.red}</strong> to use today · <strong className="text-fg">{counts.yellow}</strong> soon ·{' '}
              <strong className="text-fg">{counts.green}</strong> fresh
            </span>
          )
        }
        actions={
          <>
            <Link to="/scan" className="btn btn-primary">
              <ScanLine size={18} aria-hidden /> Scan
            </Link>
            <Link to="/add" className="btn btn-secondary">
              <Plus size={18} aria-hidden /> Add item
            </Link>
          </>
        }
      />

      {cachedAt && (
        <p className="rounded-xl bg-tint px-3 py-2 text-sm text-fg-2">Showing your list as of {formatDateTime(cachedAt, locale, timeZone)}.</p>
      )}

      {pendingScans > 0 && online && (
        <Link to="/scan" className="card flex items-center gap-3 px-4 py-3 font-semibold hover:bg-tint">
          <ClipboardCheck size={20} aria-hidden />
          {pendingScans === 1 ? '1 scan is waiting for your review' : `${pendingScans} scans are waiting for your review`}
        </Link>
      )}

      <CommandBar locale={locale} />

      {loading && items.length === 0 ? (
        <div className="flex justify-center py-16">
          <Spinner label="Loading your food" size={28} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Refrigerator size={40} />}
          title="Nothing tracked yet"
          actions={
            <>
              <Link to="/scan?type=receipt" className="btn btn-primary">
                <Receipt size={18} aria-hidden /> Scan a receipt
              </Link>
              <Link to="/add" className="btn btn-secondary">
                <Plus size={18} aria-hidden /> Add by hand
              </Link>
              <button type="button" className="btn btn-secondary" onClick={() => void demo()} disabled={loadingDemo || !online}>
                {loadingDemo ? <Spinner label="Loading demo" /> : <Sparkles size={18} aria-hidden />} Load demo data
              </button>
            </>
          }
        >
          Snap a grocery receipt or a single product and FridgeWise fills in the details and expiration dates for you.
        </EmptyState>
      ) : (
        <>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative md:w-72">
              <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" aria-hidden />
              <label htmlFor="dash-search" className="sr-only">
                Search your food
              </label>
              <input
                id="dash-search"
                type="search"
                className="input pl-10"
                placeholder="Search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" role="group" aria-label="Filter by location">
              <button type="button" className="chip" aria-pressed={location === 'all'} onClick={() => setLocation('all')}>
                All
              </button>
              {LOCATIONS.map((l) => (
                <button key={l} type="button" className="chip" aria-pressed={location === l} onClick={() => setLocation(l)}>
                  {LOCATION_LABEL[l]}
                </button>
              ))}
            </div>
            <div className="md:ml-auto md:w-52">
              <label htmlFor="dash-category" className="sr-only">
                Filter by category
              </label>
              <select id="dash-category" className="input" value={category} onChange={(e) => setCategory(e.target.value as 'all' | Category)}>
                <option value="all">All categories</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {sections.every((s) => s.count === 0) && filtersActive && (
            <p className="py-8 text-center text-fg-2">No items match these filters.</p>
          )}

          <div className="space-y-5">
            {sections.map(({ status, groups, count }, index) =>
              count === 0 ? null : (
                <section
                  key={status}
                  ref={status === 'yellow' ? soonRef : undefined}
                  aria-labelledby={`section-${status}`}
                  className={`card overflow-hidden border-l-4 animate-rise ${SECTION_ACCENT[status]}`}
                  style={{ animationDelay: `${index * 90}ms` }}
                >
                  <header className="flex items-baseline justify-between gap-2 border-b border-line px-4 py-3">
                    <h2 id={`section-${status}`} className="text-lg font-bold">
                      {FRESHNESS_LABEL[status]} <span className="font-semibold text-fg-2">({count})</span>
                    </h2>
                    <p className="hidden text-sm text-fg-2 sm:block">{SECTION_HELP[status]}</p>
                  </header>
                  <ul className="divide-y divide-line">
                    {groups.map((g) => (
                      <ItemGroup
                        key={g[0].id}
                        items={g}
                        batchTotal={batchCounts.get(g[0].name.trim().toLowerCase()) ?? g.length}
                        today={today}
                        reminderDaysBefore={rdb}
                        locale={locale}
                        busy={busyId !== null || !online}
                        onUsed={(it) => void quick(it, 'used')}
                        onTossed={(it) => void quick(it, 'tossed')}
                      />
                    ))}
                  </ul>
                </section>
              ),
            )}
          </div>
        </>
      )}
    </div>
  );
}
