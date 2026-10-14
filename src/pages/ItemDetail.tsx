import { ArrowLeft, Bot, Check, ClockArrowUp, LockOpen, PackageOpen, Pencil, Trash, Undo2, UserRound } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { formFromItem, ItemForm, formToColumns, type ItemFormValues } from '../components/ItemForm';
import { EmptyState, ErrorNote, FreshnessBadge, Sheet, Spinner } from '../components/ui';
import { useOnline } from '../hooks/useOnline';
import { useUndo } from '../hooks/useUndo';
import { errorMessage, recordUse, recordWaste } from '../lib/api';
import { AI_WRITABLE_FIELDS, CATEGORY_ICON, CATEGORY_LABEL, FIELD_LABEL, LOCATION_LABEL, SOURCE_LABEL, UNIT_LABEL, formatQuantity } from '../lib/catalog';
import { dateOf, expiryPhrase, formatDate, formatDateTime, freshness } from '../lib/dates';
import { formatMoney } from '../lib/format';
import { batchTitle, canUndo, describeRow, groupHistory } from '../lib/history';
import { supabase } from '../lib/supabase';
import { useAuth } from '../state/auth';
import { useItems } from '../state/items';
import { useToast } from '../state/toast';
import type { EditLogRow, FoodItem } from '../types/app';
import type { TablesUpdate } from '../types/database';

const FRACTIONS = [
  { label: '¼', value: 0.25 },
  { label: '½', value: 0.5 },
  { label: '¾', value: 0.75 },
];

export function ItemDetail() {
  const { id } = useParams<{ id: string }>();
  const { profile, today, locale, timeZone } = useAuth();
  const { refresh: refreshItems } = useItems();
  const toast = useToast();
  const navigate = useNavigate();
  const online = useOnline();
  const [item, setItem] = useState<FoodItem | null>(null);
  const [history, setHistory] = useState<EditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ItemFormValues | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useSheet, setUseSheet] = useState(false);
  const [amount, setAmount] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [{ data: it }, { data: log }] = await Promise.all([
      supabase.from('food_items').select('*').eq('id', id).maybeSingle(),
      supabase.from('ai_edit_log').select('*').eq('food_item_id', id).order('created_at', { ascending: false }).order('id').limit(300),
    ]);
    setItem(it ?? null);
    setHistory(log ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const undo = useUndo(load);
  const batches = useMemo(() => groupHistory(history), [history]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading item" size={28} />
      </div>
    );
  }
  if (!item) {
    return (
      <EmptyState title="Item not found" actions={<Link to="/" className="btn btn-primary">Back to your kitchen</Link>}>
        It may have been removed.
      </EmptyState>
    );
  }

  const current = item;
  const status = freshness(current.expiration_date, today, profile?.reminder_days_before ?? 2);
  const Icon = CATEGORY_ICON[current.category];
  const active = current.status === 'active';

  function startEdit() {
    setForm(formFromItem(current, timeZone));
    setEditing(true);
    setError(null);
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    const parsed = formToColumns(form);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    // Only send fields that changed: the database locks exactly those (user always wins).
    const before = formToColumns(formFromItem(current, timeZone));
    const patch: Record<string, unknown> = {};
    // (typed loosely while building; the database validates every value and type)
    for (const f of AI_WRITABLE_FIELDS) {
      if (f === 'expiration_source') continue;
      const next = (parsed.values as Record<string, unknown>)[f];
      const prev = before.ok ? (before.values as Record<string, unknown>)[f] : undefined;
      if (next !== prev) patch[f] = next;
    }
    if (Object.keys(patch).length === 0) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const { error: err } = await supabase.from('food_items').update(patch as TablesUpdate<'food_items'>).eq('id', current.id);
    setSaving(false);
    if (err) {
      setError(errorMessage(err));
      return;
    }
    setEditing(false);
    await Promise.all([load(), refreshItems()]);
    toast.show('Saved. The AI will leave the fields you changed alone.', { tone: 'success' });
  }

  async function act(fn: () => Promise<{ batch_id: string }>, message: string) {
    setBusy(true);
    try {
      const res = await fn();
      await Promise.all([load(), refreshItems()]);
      toast.show(message, { tone: 'success', action: { label: 'Undo', onClick: () => undo(res.batch_id) } });
    } catch (err) {
      toast.show(errorMessage(err), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function markOpened() {
    setBusy(true);
    const { error: err } = await supabase.from('food_items').update({ opened_at: new Date().toISOString() }).eq('id', current.id);
    setBusy(false);
    if (err) toast.show(errorMessage(err), { tone: 'error' });
    else {
      await Promise.all([load(), refreshItems()]);
      toast.show('Marked as opened. The expiration date was updated if opening shortens it.', { tone: 'success' });
    }
  }

  async function unlock(field: string) {
    const next = current.user_locked_fields.filter((f) => f !== field);
    const { error: err } = await supabase.from('food_items').update({ user_locked_fields: next }).eq('id', current.id);
    if (err) toast.show(errorMessage(err), { tone: 'error' });
    else await load();
  }

  async function remove() {
    setBusy(true);
    const { error: err } = await supabase.from('food_items').delete().eq('id', current.id);
    setBusy(false);
    if (err) {
      toast.show(errorMessage(err), { tone: 'error' });
      return;
    }
    await refreshItems();
    toast.show(`${current.name} deleted.`);
    navigate('/', { replace: true });
  }

  const usedAmount = Number(amount);
  const amountValid = Number.isFinite(usedAmount) && usedAmount > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link to="/" className="inline-flex items-center gap-1 text-sm font-semibold text-fg-2 hover:text-fg">
        <ArrowLeft size={16} aria-hidden data-anim="bounce" /> Back
      </Link>

      <section className="card p-4 sm:p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-tint text-fg-2" aria-hidden>
            <Icon size={28} />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight">{current.name}</h1>
            <p className="text-fg-2">
              {[current.brand, CATEGORY_LABEL[current.category], LOCATION_LABEL[current.storage_location]].filter(Boolean).join(' · ')}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {active ? (
                <FreshnessBadge status={status}>{expiryPhrase(current.expiration_date, today)}</FreshnessBadge>
              ) : (
                <span className="badge badge-neutral">{current.status === 'used' ? 'Used' : 'Tossed'}</span>
              )}
              {current.expiration_source && (
                <span className="text-sm text-fg-2">
                  Date: {SOURCE_LABEL[current.expiration_source]}
                  {current.ai_confidence !== null && ` · ${Math.round(current.ai_confidence * 100)}% sure`}
                </span>
              )}
            </div>
          </div>
          {active && !editing && (
            <button type="button" className="btn btn-secondary btn-sm shrink-0" onClick={startEdit} disabled={!online} aria-label="Edit item">
              <Pencil size={16} aria-hidden data-anim="wiggle" /> <span className="hidden sm:inline">Edit</span>
            </button>
          )}
        </div>

        {!editing ? (
          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-fg-2">Quantity</dt>
              <dd className="font-semibold">{formatQuantity(current.quantity, current.unit)}</dd>
            </div>
            <div>
              <dt className="text-fg-2">Expires</dt>
              <dd className="font-semibold">{formatDate(current.expiration_date, locale)}</dd>
            </div>
            <div>
              <dt className="text-fg-2">Purchased</dt>
              <dd className="font-semibold">{formatDate(current.purchase_date, locale)}</dd>
            </div>
            <div>
              <dt className="text-fg-2">Opened</dt>
              <dd className="font-semibold">{current.opened_at ? formatDate(dateOf(current.opened_at, timeZone), locale) : 'No'}</dd>
            </div>
            <div>
              <dt className="text-fg-2">Price</dt>
              <dd className="font-semibold">{formatMoney(current.price_cents, locale)}</dd>
            </div>
            {current.barcode && (
              <div>
                <dt className="text-fg-2">Barcode</dt>
                <dd className="font-semibold tabular-nums">{current.barcode}</dd>
              </div>
            )}
            {current.notes && (
              <div className="col-span-2 sm:col-span-3">
                <dt className="text-fg-2">Notes</dt>
                <dd>{current.notes}</dd>
              </div>
            )}
          </dl>
        ) : (
          form && (
            <form onSubmit={(e) => void saveEdit(e)} className="mt-5 space-y-4">
              <ItemForm values={form} onChange={(p) => setForm((f) => (f ? { ...f, ...p } : f))} locked={current.user_locked_fields} idPrefix="edit" />
              {error && <ErrorNote>{error}</ErrorNote>}
              <div className="flex justify-end gap-2">
                <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <Spinner label="Saving" /> : 'Save changes'}
                </button>
              </div>
            </form>
          )
        )}

        {current.user_locked_fields.length > 0 && !editing && (
          <div className="mt-5 rounded-xl bg-tint p-3 text-sm">
            <p className="font-semibold">You set these yourself, so the AI won't change them:</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {current.user_locked_fields.map((f) => (
                <button key={f} type="button" className="chip" onClick={() => void unlock(f)} disabled={!online} title="Let the AI update this again">
                  {FIELD_LABEL[f] ?? f}
                  <LockOpen size={14} aria-hidden />
                </button>
              ))}
            </div>
            <p className="mt-2 text-fg-2">Tap a field to let the AI update it again.</p>
          </div>
        )}

        {active && !editing && (
          <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
            <button type="button" className="btn btn-primary" disabled={busy || !online} onClick={() => void act(() => recordUse(current.id), `${current.name} marked as used.`)}>
              <Check size={18} aria-hidden data-anim="pop" /> Used it all
            </button>
            <button type="button" className="btn btn-secondary" disabled={busy || !online} onClick={() => { setAmount(''); setUseSheet(true); }}>
              Used some
            </button>
            <button type="button" className="btn btn-secondary" disabled={busy || !online} onClick={() => void act(() => recordWaste(current.id), `${current.name} marked as tossed.`)}>
              <Trash size={18} aria-hidden data-anim="wiggle" /> Tossed it
            </button>
            {!current.opened_at && (
              <button type="button" className="btn btn-secondary" disabled={busy || !online} onClick={() => void markOpened()}>
                <PackageOpen size={18} aria-hidden /> Opened today
              </button>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="history-title" className="card p-4 sm:p-6">
        <h2 id="history-title" className="mb-4 flex items-center gap-2 text-lg font-bold">
          <ClockArrowUp size={20} aria-hidden /> History
        </h2>
        {batches.length === 0 ? (
          <p className="text-fg-2">No changes recorded yet.</p>
        ) : (
          <ol className="relative space-y-4 border-l-2 border-line pl-5">
            {batches.map((b) => (
              <li key={b.batchId} className="relative">
                <span
                  className={`absolute -left-[1.95rem] top-0.5 flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface ${b.source === 'user' ? 'bg-tint text-fg-2' : 'bg-accent text-on-accent'}`}
                  aria-hidden
                >
                  {b.source === 'user' ? <UserRound size={14} /> : <Bot size={14} />}
                </span>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold">
                    {batchTitle(b)}
                    {b.source !== 'user' && <span className="ml-2 text-xs font-bold uppercase tracking-wide text-fg-2">AI</span>}
                  </p>
                  <time className="text-xs text-fg-2" dateTime={b.createdAt}>
                    {formatDateTime(b.createdAt, locale, timeZone)}
                  </time>
                </div>
                {b.reason && <p className="text-sm text-fg-2">“{b.reason}”</p>}
                <ul className="mt-1 space-y-0.5 text-sm">
                  {b.rows.map((r) => (
                    <li key={r.id} className={r.reverted_at ? 'text-fg-2 line-through' : ''}>
                      {describeRow(r, locale, current.unit)}
                      {r.source !== 'user' && r.confidence !== null && <span className="text-fg-2"> · {Math.round(r.confidence * 100)}% sure</span>}
                      {b.source !== 'user' && r.source === 'user' && <span className="text-fg-2"> · corrected by you</span>}
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex items-center gap-3">
                  {b.reverted ? (
                    <span className="badge badge-neutral">Undone</span>
                  ) : (
                    canUndo(b) && (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => void undo(b.batchId)} disabled={!online}>
                        <Undo2 size={16} aria-hidden data-anim="spin" /> Undo
                      </button>
                    )
                  )}
                  {b.model && b.source !== 'user' && <span className="text-xs text-fg-2">{b.model}</span>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="card p-4 sm:p-6">
        <h2 className="font-bold">Delete item</h2>
        <p className="mt-1 text-sm text-fg-2">Only for mistakes. To keep your stats right, use "Used" or "Tossed" instead.</p>
        <button type="button" className="btn btn-secondary mt-3" onClick={() => setConfirmDelete(true)} disabled={!online}>
          <Trash size={16} aria-hidden data-anim="wiggle" /> Delete
        </button>
      </section>

      <Sheet
        open={useSheet}
        onClose={() => setUseSheet(false)}
        title={`How much ${current.name} did you use?`}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setUseSheet(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!amountValid || busy}
              onClick={() => {
                setUseSheet(false);
                void act(() => recordUse(current.id, usedAmount), `Updated ${current.name}.`);
              }}
            >
              Save
            </button>
          </>
        }
      >
        <p className="mb-3 text-fg-2">You have {formatQuantity(current.quantity, current.unit)}.</p>
        <div className="mb-3 flex gap-2">
          {FRACTIONS.map((f) => (
            <button key={f.label} type="button" className="chip" onClick={() => setAmount(String(Math.round(Number(current.quantity) * f.value * 1000) / 1000))}>
              {f.label}
            </button>
          ))}
        </div>
        <label className="label" htmlFor="amount">
          Amount used ({UNIT_LABEL[current.unit]})
        </label>
        <input id="amount" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} data-autofocus />
        {amountValid && usedAmount >= Number(current.quantity) && <p className="mt-2 text-sm text-fg-2">That's all of it; the item will be marked as used.</p>}
      </Sheet>

      <Sheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this item?"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(false)}>
              Keep it
            </button>
            <button type="button" className="btn btn-danger" onClick={() => void remove()} disabled={busy}>
              Delete
            </button>
          </>
        }
      >
        <p>{current.name} will be removed from your list. This can't be undone.</p>
      </Sheet>
    </div>
  );
}
