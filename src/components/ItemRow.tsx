import { Check, Lock, Trash } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CATEGORY_ICON, LOCATION_ICON, LOCATION_LABEL, formatQuantity } from '../lib/catalog';
import { expiryPhrase, formatDate, freshness } from '../lib/dates';
import type { FoodItem } from '../types/app';
import { FreshnessBadge } from './ui';

interface RowProps {
  item: FoodItem;
  today: string;
  reminderDaysBefore: number;
  locale: string;
  onUsed?: (item: FoodItem) => void;
  onTossed?: (item: FoodItem) => void;
  busy?: boolean;
  /** Inside a batch group the name is already shown in the group header. */
  compact?: boolean;
  /** How many active batches share this name across the whole list. */
  batchTotal?: number;
}

export function ItemRow({ item, today, reminderDaysBefore, locale, onUsed, onTossed, busy, compact, batchTotal = 1 }: RowProps) {
  const status = freshness(item.expiration_date, today, reminderDaysBefore);
  const Icon = CATEGORY_ICON[item.category];
  const LocIcon = LOCATION_ICON[item.storage_location];
  const phrase = expiryPhrase(item.expiration_date, today);

  return (
    <li className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
      <Link to={`/item/${item.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-1 focus-visible:outline-offset-4">
        {!compact && (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tint text-fg-2" aria-hidden>
            <Icon size={20} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-semibold">
              {compact ? `Batch from ${formatDate(item.purchase_date, locale, { month: 'short', day: 'numeric' })}` : item.name}
            </span>
            {item.user_locked_fields.length > 0 && <Lock size={13} className="shrink-0 text-fg-2" aria-label="Has fields you set" />}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-2">
            <span className="sm:hidden">
              <FreshnessBadge status={status}>{phrase}</FreshnessBadge>
            </span>
            {!compact && item.brand && <span className="hidden truncate sm:inline">{item.brand}</span>}
            <span>{formatQuantity(item.quantity, item.unit)}</span>
            <span className="inline-flex items-center gap-1">
              <LocIcon size={14} aria-hidden />
              {LOCATION_LABEL[item.storage_location]}
            </span>
            {item.opened_at && <span>Opened</span>}
            {!compact && batchTotal > 1 && <span>1 of {batchTotal} batches</span>}
          </span>
        </span>
        <span className="hidden shrink-0 text-right sm:block">
          <FreshnessBadge status={status}>{phrase}</FreshnessBadge>
          {item.expiration_date && <span className="mt-1 block text-xs text-fg-2">{formatDate(item.expiration_date, locale)}</span>}
        </span>
      </Link>
      {(onUsed || onTossed) && (
        <span className="flex shrink-0 gap-1">
          {onUsed && (
            <button
              type="button"
              className="btn btn-secondary btn-icon"
              disabled={busy}
              onClick={() => onUsed(item)}
              aria-label={`Mark ${item.name} as used`}
              title="Used it"
            >
              <Check size={18} />
            </button>
          )}
          {onTossed && (
            <button
              type="button"
              className="btn btn-secondary btn-icon"
              disabled={busy}
              onClick={() => onTossed(item)}
              aria-label={`Mark ${item.name} as tossed`}
              title="Tossed it"
            >
              <Trash size={18} />
            </button>
          )}
        </span>
      )}
    </li>
  );
}

/** Same-name items are separate batches (each with its own date); show them together. */
export function ItemGroup({ items, batchTotal = items.length, ...rest }: Omit<RowProps, 'item' | 'compact'> & { items: FoodItem[] }) {
  if (items.length === 1) return <ItemRow item={items[0]} batchTotal={batchTotal} {...rest} />;
  const first = items[0];
  const Icon = CATEGORY_ICON[first.category];
  return (
    <li className="py-1">
      <div className="flex items-center gap-3 px-3 pt-2 sm:px-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tint text-fg-2" aria-hidden>
          <Icon size={20} />
        </span>
        <span className="font-semibold">{first.name}</span>
        <span className="badge badge-neutral">
          {items.length} batches{batchTotal > items.length ? ` (${batchTotal} in total)` : ''}
        </span>
      </div>
      <ul className="ml-[3.25rem] sm:ml-[3.75rem]">
        {items.map((it) => (
          <ItemRow key={it.id} item={it} {...rest} compact />
        ))}
      </ul>
    </li>
  );
}
