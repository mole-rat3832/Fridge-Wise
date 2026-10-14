// "Do I have it?" Search what's at home before shopping. Works offline from the cached list.
import { CircleCheck, Plus, Search, ShoppingBasket } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FreshnessBadge, PageHeader } from '../components/ui';
import { CATEGORY_LABEL, LOCATION_LABEL, formatQuantity } from '../lib/catalog';
import { expiryPhrase, freshness } from '../lib/dates';
import { searchTokens } from '../lib/format';
import { useAuth } from '../state/auth';
import { useItems } from '../state/items';
import type { FoodItem } from '../types/app';

function matches(item: FoodItem, term: string): boolean {
  const want = searchTokens(term);
  if (want.length === 0) return false;
  const have = searchTokens(`${item.name} ${item.brand ?? ''} ${CATEGORY_LABEL[item.category]}`);
  return want.every((w) => have.some((h) => h === w || h.startsWith(w) || (w.length >= 4 && h.includes(w))));
}

export function ShoppingCheck() {
  const { profile, today } = useAuth();
  const { items } = useItems();
  const [text, setText] = useState('');
  const rdb = profile?.reminder_days_before ?? 2;

  const terms = useMemo(
    () =>
      [...new Set(text.split(/[,\n;]+/).map((t) => t.trim()).filter(Boolean))].slice(0, 30),
    [text],
  );

  const results = useMemo(
    () =>
      terms.map((term) => ({
        term,
        found: items.filter((it) => matches(it, term)).sort((a, b) => (a.expiration_date ?? '9999').localeCompare(b.expiration_date ?? '9999')),
      })),
    [terms, items],
  );

  const missing = results.filter((r) => r.found.length === 0).length;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Do I have it?" subtitle="Check what's at home before you buy more. Separate items with commas or new lines." />
      <div className="card p-4 sm:p-5">
        <label htmlFor="check" className="label">
          Your shopping list
        </label>
        <div className="relative">
          <Search size={18} className="pointer-events-none absolute left-3 top-3.5 text-fg-3" aria-hidden />
          <textarea
            id="check"
            className="input min-h-24 pl-10"
            placeholder="milk, eggs, spinach"
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
        </div>
        {terms.length > 0 && (
          <p className="mt-2 text-sm text-fg-2" aria-live="polite">
            {terms.length - missing} of {terms.length} already at home{missing ? ` · ${missing} to buy` : ''}.
          </p>
        )}
      </div>

      {results.length > 0 && (
        <ul className="space-y-3">
          {results.map(({ term, found }) => (
            <li key={term} className="card p-4">
              {found.length === 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="flex items-center gap-2 font-semibold">
                    <ShoppingBasket size={20} aria-hidden /> {term}: not at home
                  </p>
                  <Link to={`/add?name=${encodeURIComponent(term)}`} className="btn btn-secondary btn-sm">
                    <Plus size={16} aria-hidden /> Add after shopping
                  </Link>
                </div>
              ) : (
                <>
                  <p className="flex items-center gap-2 font-semibold">
                    <CircleCheck size={20} aria-hidden /> {term}: you have {found.length === 1 ? 'it' : `${found.length}`}
                  </p>
                  <ul className="mt-2 divide-y divide-line">
                    {found.map((it) => {
                      const status = freshness(it.expiration_date, today, rdb);
                      return (
                        <li key={it.id}>
                          <Link to={`/item/${it.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                            <span>
                              <span className="font-semibold">{it.name}</span>
                              <span className="text-fg-2">
                                {' '}
                                · {formatQuantity(it.quantity, it.unit)} · {LOCATION_LABEL[it.storage_location]}
                              </span>
                            </span>
                            <FreshnessBadge status={status}>{expiryPhrase(it.expiration_date, today)}</FreshnessBadge>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                  {found.every((it) => freshness(it.expiration_date, today, rdb) === 'red') && (
                    <p className="mt-1 text-sm text-fg-2">What you have expires today or already has. You may want to buy fresh.</p>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
