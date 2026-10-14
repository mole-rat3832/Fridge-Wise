import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { CATEGORIES, CATEGORY_LABEL, LOCATION_LABEL, LOCATIONS, UNIT_LABEL, UNITS } from '../lib/catalog';
import { dateOf } from '../lib/dates';
import type { Category, FoodItem, StorageLocation, Unit } from '../types/app';
import { Field } from './ui';

export interface ItemFormValues {
  name: string;
  brand: string;
  category: Category;
  storage_location: StorageLocation;
  quantity: string;
  unit: Unit;
  price: string;
  barcode: string;
  purchase_date: string;
  expiration_date: string;
  opened_on: string;
  notes: string;
}

export function emptyForm(today: string): ItemFormValues {
  return {
    name: '',
    brand: '',
    category: 'other',
    storage_location: 'fridge',
    quantity: '1',
    unit: 'count',
    price: '',
    barcode: '',
    purchase_date: today,
    expiration_date: '',
    opened_on: '',
    notes: '',
  };
}

export function formFromItem(item: FoodItem, timeZone: string): ItemFormValues {
  return {
    name: item.name,
    brand: item.brand ?? '',
    category: item.category,
    storage_location: item.storage_location,
    quantity: String(Number(item.quantity)),
    unit: item.unit,
    price: item.price_cents === null ? '' : (item.price_cents / 100).toFixed(2),
    barcode: item.barcode ?? '',
    purchase_date: item.purchase_date ?? '',
    expiration_date: item.expiration_date ?? '',
    opened_on: item.opened_at ? dateOf(item.opened_at, timeZone) : '',
    notes: item.notes ?? '',
  };
}

/** Form values -> food_items columns (only whitelisted fields). Returns an error message when invalid. */
export function formToColumns(v: ItemFormValues): { ok: true; values: Partial<FoodItem> } | { ok: false; error: string } {
  const name = v.name.trim();
  if (!name) return { ok: false, error: 'Give the item a name.' };
  const quantity = Number(v.quantity);
  if (!Number.isFinite(quantity) || quantity < 0) return { ok: false, error: 'Quantity must be 0 or more.' };
  let price_cents: number | null = null;
  if (v.price.trim()) {
    const p = Number(v.price.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(p) || p < 0) return { ok: false, error: 'Price must be a number.' };
    price_cents = Math.round(p * 100);
  }
  const barcode = v.barcode.replace(/\D/g, '');
  if (barcode && (barcode.length < 6 || barcode.length > 14)) return { ok: false, error: 'A barcode has 6 to 14 digits.' };
  if (v.purchase_date && v.expiration_date && v.expiration_date < v.purchase_date) {
    // Allowed (a printed date can precede purchase for clearance items), but flag obvious typos.
    const days = (Date.parse(v.purchase_date) - Date.parse(v.expiration_date)) / 86_400_000;
    if (days > 30) return { ok: false, error: 'The expiration date is long before the purchase date. Check both dates.' };
  }
  if (v.purchase_date && v.expiration_date) {
    const limit = new Date(`${v.purchase_date}T00:00:00Z`);
    limit.setUTCFullYear(limit.getUTCFullYear() + 3);
    if (v.expiration_date > limit.toISOString().slice(0, 10)) return { ok: false, error: 'The expiration date can be at most 3 years after purchase.' };
  }
  return {
    ok: true,
    values: {
      name: name.slice(0, 120),
      brand: v.brand.trim() ? v.brand.trim().slice(0, 80) : null,
      category: v.category,
      storage_location: v.storage_location,
      quantity: Math.round(quantity * 1000) / 1000,
      unit: v.unit,
      price_cents,
      barcode: barcode || null,
      purchase_date: v.purchase_date || null,
      expiration_date: v.expiration_date || null,
      opened_at: v.opened_on ? `${v.opened_on}T12:00:00Z` : null,
      notes: v.notes.trim() ? v.notes.trim().slice(0, 1000) : null,
    },
  };
}

interface Props {
  values: ItemFormValues;
  onChange: (patch: Partial<ItemFormValues>) => void;
  locked?: string[];
  expirationHint?: ReactNode;
  idPrefix?: string;
}

function LockMark({ on }: { on: boolean }) {
  return on ? <Lock size={13} className="ml-1 inline text-fg-2" aria-label="You set this; the AI won't change it" /> : null;
}

export function ItemForm({ values, onChange, locked = [], expirationHint, idPrefix = 'item' }: Props) {
  const id = (k: string) => `${idPrefix}-${k}`;
  const isLocked = (f: string) => locked.includes(f);
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Name" htmlFor={id('name')} className="sm:col-span-2">
        <input id={id('name')} className="input" value={values.name} onChange={(e) => onChange({ name: e.target.value })} required maxLength={120} placeholder="e.g. 2% Milk" />
      </Field>
      <Field label="Brand (optional)" htmlFor={id('brand')}>
        <input id={id('brand')} className="input" value={values.brand} onChange={(e) => onChange({ brand: e.target.value })} maxLength={80} />
      </Field>
      <Field label="Category" htmlFor={id('category')}>
        <select id={id('category')} className="input" value={values.category} onChange={(e) => onChange({ category: e.target.value as Category })}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </Field>
      <fieldset className="sm:col-span-2">
        <legend className="label">
          Where is it?
          <LockMark on={isLocked('storage_location')} />
        </legend>
        <div className="flex flex-wrap gap-2">
          {LOCATIONS.map((l) => (
            <button key={l} type="button" className="chip" aria-pressed={values.storage_location === l} onClick={() => onChange({ storage_location: l })}>
              {LOCATION_LABEL[l]}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Quantity" htmlFor={id('quantity')}>
          <input id={id('quantity')} className="input" inputMode="decimal" value={values.quantity} onChange={(e) => onChange({ quantity: e.target.value })} />
        </Field>
        <Field label="Unit" htmlFor={id('unit')}>
          <select id={id('unit')} className="input" value={values.unit} onChange={(e) => onChange({ unit: e.target.value as Unit })}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {UNIT_LABEL[u]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Price (optional)" htmlFor={id('price')}>
        <input id={id('price')} className="input" inputMode="decimal" placeholder="0.00" value={values.price} onChange={(e) => onChange({ price: e.target.value })} />
      </Field>
      <Field label="Purchased" htmlFor={id('purchase')}>
        <input id={id('purchase')} type="date" className="input" value={values.purchase_date} onChange={(e) => onChange({ purchase_date: e.target.value })} />
      </Field>
      <Field
        label={isLocked('expiration_date') ? 'Expires (set by you)' : 'Expires'}
        htmlFor={id('expiration')}
        hint={expirationHint}
      >
        <input id={id('expiration')} type="date" className="input" value={values.expiration_date} onChange={(e) => onChange({ expiration_date: e.target.value })} />
      </Field>
      <Field label="Opened on (optional)" htmlFor={id('opened')} hint="Opening an item can shorten how long it keeps.">
        <input id={id('opened')} type="date" className="input" value={values.opened_on} onChange={(e) => onChange({ opened_on: e.target.value })} />
      </Field>
      <Field label="Barcode (optional)" htmlFor={id('barcode')}>
        <input id={id('barcode')} className="input" inputMode="numeric" value={values.barcode} onChange={(e) => onChange({ barcode: e.target.value })} />
      </Field>
      <Field label="Notes (optional)" htmlFor={id('notes')} className="sm:col-span-2">
        <textarea id={id('notes')} className="input min-h-20" value={values.notes} onChange={(e) => onChange({ notes: e.target.value })} maxLength={1000} />
      </Field>
    </div>
  );
}
