// Review screen: every staged scan_item is an editable row. Nothing reaches food_items until
// Confirm, which calls the confirm_scan RPC (one transaction: insert items, log, link, mark confirmed).
import { ArrowLeft, Info, RefreshCw, Trash } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { EmptyState, ErrorNote, Field, PageHeader, Spinner } from '../components/ui';
import { useOnline } from '../hooks/useOnline';
import { useUndo } from '../hooks/useUndo';
import { confirmScan, errorMessage, scanImage } from '../lib/api';
import { CATEGORIES, CATEGORY_LABEL, LOCATION_LABEL, LOCATIONS, LOW_CONFIDENCE, SOURCE_LABEL, UNIT_LABEL, UNITS } from '../lib/catalog';
import { addDays, diffDays, formatDate } from '../lib/dates';
import { supabase } from '../lib/supabase';
import { useAuth } from '../state/auth';
import { useItems } from '../state/items';
import { useToast } from '../state/toast';
import type { Category, Scan, ScanItem, StorageLocation, Unit } from '../types/app';

interface Row {
  id: string;
  include: boolean;
  name: string;
  brand: string;
  category: Category;
  storage_location: StorageLocation;
  quantity: string;
  unit: Unit;
  price: string;
  expiration_date: string;
  expirationTouched: boolean;
}

function toRow(si: ScanItem): Row {
  return {
    id: si.id,
    include: si.include,
    name: si.name,
    brand: si.brand ?? '',
    category: si.category,
    storage_location: si.storage_location,
    quantity: String(Number(si.quantity)),
    unit: si.unit,
    price: si.price_cents === null ? '' : (si.price_cents / 100).toFixed(2),
    expiration_date: si.estimated_expiration_date ?? '',
    expirationTouched: false,
  };
}

function conf(si: ScanItem, field: string): number | null {
  const c = (si.field_confidence as Record<string, number> | null)?.[field];
  return typeof c === 'number' ? c : null;
}

const low = (si: ScanItem, field: string) => {
  const c = conf(si, field);
  return c !== null && c < LOW_CONFIDENCE;
};

export function ScanReview() {
  const { id } = useParams<{ id: string }>();
  const { today, locale } = useAuth();
  const { refresh } = useItems();
  const toast = useToast();
  const undo = useUndo();
  const navigate = useNavigate();
  const online = useOnline();
  const [scan, setScan] = useState<Scan | null>(null);
  const [items, setItems] = useState<ScanItem[]>([]);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [purchaseDate, setPurchaseDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const [{ data: s }, { data: si }] = await Promise.all([
      supabase.from('scans').select('*').eq('id', id).maybeSingle(),
      supabase.from('scan_items').select('*').eq('scan_id', id).order('position'),
    ]);
    setScan(s ?? null);
    setItems(si ?? []);
    setRows(Object.fromEntries((si ?? []).map((x) => [x.id, toRow(x)])));
    setPurchaseDate(s?.purchase_date ?? today);
    setLoading(false);
  }, [id, today]);

  useEffect(() => {
    void load();
  }, [load]);

  // If the user comes back while the AI is still reading, poll until it finishes.
  useEffect(() => {
    if (scan?.status !== 'processing' && scan?.status !== 'uploaded') return;
    const t = window.setInterval(() => void load(), 2500);
    return () => window.clearInterval(t);
  }, [scan?.status, load]);

  const included = useMemo(() => Object.values(rows).filter((r) => r.include).length, [rows]);

  function update(rowId: string, patch: Partial<Row>) {
    setRows((r) => ({ ...r, [rowId]: { ...r[rowId], ...patch } }));
  }

  // Changing the purchase date moves dates that were calculated from it (not printed ones).
  function changePurchaseDate(next: string) {
    if (!next) return;
    const delta = purchaseDate ? diffDays(next, purchaseDate) : 0;
    setPurchaseDate(next);
    if (delta === 0) return;
    setRows((current) => {
      const out = { ...current };
      for (const si of items) {
        const r = out[si.id];
        if (r && r.expiration_date && !r.expirationTouched && si.expiration_source !== 'printed_date') {
          out[si.id] = { ...r, expiration_date: addDays(r.expiration_date, delta) };
        }
      }
      return out;
    });
  }

  async function retry() {
    if (!scan) return;
    setRetrying(true);
    setError(null);
    try {
      await scanImage(scan.id);
      await load();
    } catch (err) {
      setError(errorMessage(err));
      await load();
    } finally {
      setRetrying(false);
    }
  }

  async function discard() {
    if (!scan) return;
    if (scan.image_path) await supabase.storage.from('scans').remove([scan.image_path]);
    await supabase.from('scans').update({ status: 'discarded', image_path: null }).eq('id', scan.id);
    toast.show('Scan discarded.');
    navigate('/scan');
  }

  async function confirm() {
    if (!scan) return;
    setError(null);
    const payload: Array<Record<string, unknown>> = [];
    for (const si of items) {
      const r = rows[si.id];
      if (!r) continue;
      if (!r.include) {
        payload.push({ scan_item_id: si.id, include: false });
        continue;
      }
      const name = r.name.trim();
      const quantity = Number(r.quantity);
      if (!name) return setError('Every included item needs a name.');
      if (!Number.isFinite(quantity) || quantity < 0) return setError(`Check the quantity of ${name}.`);
      let price_cents: number | null = null;
      if (r.price.trim()) {
        const p = Number(r.price.replace(/[^0-9.]/g, ''));
        if (!Number.isFinite(p)) return setError(`Check the price of ${name}.`);
        price_cents = Math.round(p * 100);
      }
      payload.push({
        scan_item_id: si.id,
        include: true,
        name,
        brand: r.brand.trim() || null,
        category: r.category,
        storage_location: r.storage_location,
        quantity: Math.round(quantity * 1000) / 1000,
        unit: r.unit,
        price_cents,
        purchase_date: purchaseDate || today,
        expiration_date: r.expiration_date || null,
      });
    }
    setSaving(true);
    try {
      const res = await confirmScan(scan.id, payload);
      await refresh();
      toast.show(`Added ${res.created_count} item${res.created_count === 1 ? '' : 's'} to your kitchen.`, {
        tone: 'success',
        action: { label: 'Undo', onClick: () => undo(res.batch_id) },
      });
      navigate('/');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading scan" size={28} />
      </div>
    );
  }
  if (!scan) {
    return <EmptyState title="Scan not found" actions={<Link to="/scan" className="btn btn-primary">New scan</Link>} />;
  }

  const back = (
    <Link to="/scan" className="inline-flex items-center gap-1 text-sm font-semibold text-fg-2 hover:text-fg">
      <ArrowLeft size={16} aria-hidden /> Scans
    </Link>
  );

  if (scan.status === 'processing' || scan.status === 'uploaded') {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        {back}
        <EmptyState icon={<Spinner size={32} />} title="Reading your photo…">This usually takes 5–20 seconds.</EmptyState>
      </div>
    );
  }

  if (scan.status === 'confirmed' || scan.status === 'discarded') {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        {back}
        <EmptyState
          title={scan.status === 'confirmed' ? 'These items are already in your kitchen' : 'This scan was discarded'}
          actions={<Link to="/" className="btn btn-primary">Go to your kitchen</Link>}
        />
      </div>
    );
  }

  if (scan.status === 'failed' || items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        {back}
        <EmptyState
          title={scan.status === 'failed' ? "We couldn't read this photo" : 'No items found'}
          actions={
            <>
              {scan.attempts < 3 && (
                <button type="button" className="btn btn-primary" onClick={() => void retry()} disabled={retrying || !online}>
                  {retrying ? <Spinner label="Retrying" /> : <RefreshCw size={18} aria-hidden />} Try again
                </button>
              )}
              <Link to="/add" className="btn btn-secondary">
                Add items by hand
              </Link>
              <button type="button" className="btn btn-secondary" onClick={() => void discard()}>
                Discard
              </button>
            </>
          }
        >
          {scan.error ?? 'Try a sharper photo with the whole receipt in view, or add the items yourself.'}
        </EmptyState>
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-24 lg:pb-0">
      {back}
      <PageHeader
        title="Review your scan"
        subtitle={
          <>
            Fix anything that looks off. Fields outlined in red and marked “Check this” were hard to read.
          </>
        }
      />

      {scan.type === 'receipt' && (
        <div className="card grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <div>
            <p className="label">Store</p>
            <p className="font-semibold">{scan.store_name ?? 'Unknown store'}</p>
          </div>
          <Field label="Purchase date" htmlFor="purchase-date" hint="Changing it moves the estimated expiration dates too.">
            <input id="purchase-date" type="date" className="input" value={purchaseDate} max={today} onChange={(e) => changePurchaseDate(e.target.value)} />
          </Field>
        </div>
      )}

      <ul className="space-y-3">
        {items.map((si, index) => {
          const r = rows[si.id];
          if (!r) return null;
          const pid = (k: string) => `${si.id}-${k}`;
          return (
            // Lines appear one after another, as if the AI is still reading them out.
            <li key={si.id} className={`card p-4 sm:p-5 animate-rise ${r.include ? '' : 'bg-tint'}`} style={{ animationDelay: `${Math.min(index, 12) * 70}ms` }}>
              <div className="flex items-start gap-3">
                <input
                  id={pid('include')}
                  type="checkbox"
                  className="mt-1 h-6 w-6 shrink-0 accent-leaf"
                  checked={r.include}
                  onChange={(e) => update(si.id, { include: e.target.checked })}
                />
                <div className="min-w-0 flex-1">
                  <label htmlFor={pid('include')} className="flex flex-wrap items-center gap-2 font-semibold">
                    {r.include ? 'Add this item' : 'Skip this line'}
                    {!si.is_food && <span className="badge badge-neutral">Not food</span>}
                  </label>
                  {si.raw_text && <p className="truncate font-mono text-xs text-fg-2" title={si.raw_text}>{si.raw_text}</p>}
                </div>
              </div>

              {r.include && (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-6">
                  <Field label="Name" htmlFor={pid('name')} check={low(si, 'name')} className="col-span-2 sm:col-span-3">
                    <input id={pid('name')} className={`input ${low(si, 'name') ? 'input-check' : ''}`} value={r.name} onChange={(e) => update(si.id, { name: e.target.value })} />
                  </Field>
                  <Field label="Brand" htmlFor={pid('brand')} check={low(si, 'brand') && Boolean(r.brand)} className="col-span-2 sm:col-span-3">
                    <input id={pid('brand')} className="input" value={r.brand} onChange={(e) => update(si.id, { brand: e.target.value })} />
                  </Field>
                  <Field label="Quantity" htmlFor={pid('qty')} check={low(si, 'quantity')}>
                    <input id={pid('qty')} className={`input ${low(si, 'quantity') ? 'input-check' : ''}`} inputMode="decimal" value={r.quantity} onChange={(e) => update(si.id, { quantity: e.target.value })} />
                  </Field>
                  <Field label="Unit" htmlFor={pid('unit')} check={low(si, 'unit')}>
                    <select id={pid('unit')} className={`input ${low(si, 'unit') ? 'input-check' : ''}`} value={r.unit} onChange={(e) => update(si.id, { unit: e.target.value as Unit })}>
                      {UNITS.map((u) => (
                        <option key={u} value={u}>
                          {UNIT_LABEL[u]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Category" htmlFor={pid('cat')} check={low(si, 'category')} className="col-span-2">
                    <select id={pid('cat')} className={`input ${low(si, 'category') ? 'input-check' : ''}`} value={r.category} onChange={(e) => update(si.id, { category: e.target.value as Category })}>
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {CATEGORY_LABEL[c]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Price" htmlFor={pid('price')} check={low(si, 'price_cents')} className="col-span-2 sm:col-span-2">
                    <input id={pid('price')} className={`input ${low(si, 'price_cents') ? 'input-check' : ''}`} inputMode="decimal" value={r.price} onChange={(e) => update(si.id, { price: e.target.value })} />
                  </Field>
                  <Field label="Store in" htmlFor={pid('loc')} check={low(si, 'storage_location')} className="col-span-2">
                    <select id={pid('loc')} className={`input ${low(si, 'storage_location') ? 'input-check' : ''}`} value={r.storage_location} onChange={(e) => update(si.id, { storage_location: e.target.value as StorageLocation })}>
                      {LOCATIONS.map((l) => (
                        <option key={l} value={l}>
                          {LOCATION_LABEL[l]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label="Expires"
                    htmlFor={pid('exp')}
                    check={low(si, 'expiration_date') && !r.expirationTouched}
                    className="col-span-2 sm:col-span-2"
                    hint={
                      si.expiration_source && !r.expirationTouched
                        ? `${SOURCE_LABEL[si.expiration_source]}${si.printed_date_type ? ` (${si.printed_date_type.replace('_', ' ')})` : ''}${
                            r.expiration_date ? ` · ${formatDate(r.expiration_date, locale, { month: 'short', day: 'numeric' })}` : ''
                          }`
                        : undefined
                    }
                  >
                    <input
                      id={pid('exp')}
                      type="date"
                      className={`input ${low(si, 'expiration_date') && !r.expirationTouched ? 'input-check' : ''}`}
                      value={r.expiration_date}
                      onChange={(e) => update(si.id, { expiration_date: e.target.value, expirationTouched: true })}
                    />
                  </Field>
                  {si.storage_instructions && (
                    <p className="col-span-2 flex items-start gap-1.5 text-sm text-fg-2 sm:col-span-6">
                      <Info size={15} className="mt-0.5 shrink-0" aria-hidden /> Label says: “{si.storage_instructions}”
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur lg:static lg:rounded-2xl lg:border lg:px-5">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <button type="button" className="btn btn-ghost" onClick={() => void discard()} disabled={saving}>
            <Trash size={18} aria-hidden /> Discard
          </button>
          <button type="button" className="btn btn-primary min-w-40" onClick={() => void confirm()} disabled={saving || included === 0 || !online}>
            {saving ? <Spinner label="Adding" /> : `Add ${included} item${included === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
