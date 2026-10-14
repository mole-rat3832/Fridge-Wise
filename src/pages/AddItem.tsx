import { CirclePlus, Info } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { emptyForm, ItemForm, formToColumns, type ItemFormValues } from '../components/ItemForm';
import { ErrorNote, PageHeader, Spinner } from '../components/ui';
import { useOnline } from '../hooks/useOnline';
import { errorMessage, shelfLifeLookup } from '../lib/api';
import { CATEGORIES } from '../lib/catalog';
import { addDays, formatDate } from '../lib/dates';
import { supabase } from '../lib/supabase';
import { useAuth } from '../state/auth';
import { useItems } from '../state/items';
import { useToast } from '../state/toast';
import type { Category } from '../types/app';

interface Suggestion {
  date: string;
  days: number;
  keyword: string | null;
  matchedBy: 'keyword' | 'category';
}

export function AddItem() {
  const { today, locale } = useAuth();
  const { refresh } = useItems();
  const toast = useToast();
  const navigate = useNavigate();
  const online = useOnline();
  const [params] = useSearchParams();
  const [values, setValues] = useState<ItemFormValues>(() => {
    const v = emptyForm(today);
    const name = params.get('name');
    const cat = params.get('category') as Category | null;
    if (name) v.name = name.slice(0, 120);
    if (cat && CATEGORIES.includes(cat)) v.category = cat;
    return v;
  });
  const [dateTouched, setDateTouched] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  // Suggest an expiration date from the USDA FoodKeeper table as the user types.
  useEffect(() => {
    if (!values.name.trim() || !online) {
      setSuggestion(null);
      return;
    }
    const id = ++requestId.current;
    const t = window.setTimeout(async () => {
      try {
        const [res] = await shelfLifeLookup([
          { name: values.name, category: values.category, storage_location: values.storage_location, opened: Boolean(values.opened_on) },
        ]);
        if (id !== requestId.current) return;
        if (res?.days && res.matched_by) {
          const base = values.opened_on || values.purchase_date || today;
          const s = { date: addDays(base, res.days), days: res.days, keyword: res.keyword, matchedBy: res.matched_by };
          setSuggestion(s);
          if (!dateTouched) setValues((v) => ({ ...v, expiration_date: s.date }));
        } else {
          setSuggestion(null);
        }
      } catch {
        if (id === requestId.current) setSuggestion(null);
      }
    }, 350);
    return () => window.clearTimeout(t);
  }, [values.name, values.category, values.storage_location, values.opened_on, values.purchase_date, today, dateTouched, online]);

  function patch(p: Partial<ItemFormValues>) {
    if ('expiration_date' in p) setDateTouched(true);
    setValues((v) => ({ ...v, ...p }));
  }

  async function save(e: FormEvent, again = false) {
    e.preventDefault();
    const parsed = formToColumns(values);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setSaving(true);
    setError(null);
    const usedSuggestion = suggestion !== null && values.expiration_date === suggestion.date;
    const { error: err } = await supabase.from('food_items').insert({
      ...parsed.values,
      name: parsed.values.name!,
      expiration_source: values.expiration_date ? (usedSuggestion ? 'shelf_life_table' : 'user') : null,
    });
    setSaving(false);
    if (err) {
      setError(errorMessage(err));
      return;
    }
    await refresh();
    toast.show(`${parsed.values.name} added.`, { tone: 'success' });
    if (again) {
      setValues(emptyForm(today));
      setDateTouched(false);
      setSuggestion(null);
    } else {
      navigate('/');
    }
  }

  const hint = suggestion ? (
    <span className="inline-flex items-start gap-1">
      <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
      <span>
        {values.expiration_date === suggestion.date ? 'Suggested' : 'Suggestion'}: {formatDate(suggestion.date, locale)} (
        {suggestion.days} days, USDA FoodKeeper{suggestion.matchedBy === 'keyword' && suggestion.keyword ? `: ${suggestion.keyword.split('|')[0]}` : ''}).{' '}
        {values.expiration_date !== suggestion.date && (
          <button type="button" className="font-semibold underline underline-offset-2" onClick={() => setValues((v) => ({ ...v, expiration_date: suggestion.date }))}>
            Use it
          </button>
        )}
        {values.expiration_date === suggestion.date && 'Change it if the package says otherwise.'}
      </span>
    </span>
  ) : undefined;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader icon={<CirclePlus size={24} />} title="Add an item" subtitle={<>Prefer a photo? <Link to="/scan" className="font-semibold text-fg underline underline-offset-2">Scan it instead</Link>.</>} />
      <form onSubmit={(e) => void save(e)} className="card space-y-5 p-4 sm:p-6">
        <ItemForm values={values} onChange={patch} expirationHint={hint} idPrefix="add" />
        {error && <ErrorNote>{error}</ErrorNote>}
        {!online && <ErrorNote>You're offline. Connect to save this item.</ErrorNote>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn btn-secondary" disabled={saving || !online} onClick={(e) => void save(e, true)}>
            Save and add another
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving || !online}>
            {saving ? <Spinner label="Saving" /> : 'Save item'}
          </button>
        </div>
      </form>
    </div>
  );
}
