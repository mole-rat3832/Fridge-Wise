import type { EditLogRow, FieldSource, Unit } from '../types/app';
import type { Json } from '../types/database';
import { CATEGORY_LABEL, FIELD_LABEL, LOCATION_LABEL, SOURCE_LABEL, UNIT_LABEL, formatQuantity } from './catalog';
import { formatDate } from './dates';
import { formatMoney } from './format';

export interface HistoryBatch {
  batchId: string;
  source: EditLogRow['source'];
  action: EditLogRow['action'];
  createdAt: string;
  confidence: number | null;
  model: string | null;
  reason: string | null;
  reverted: boolean;
  rows: EditLogRow[];
}

export function groupHistory(rows: EditLogRow[]): HistoryBatch[] {
  const map = new Map<string, HistoryBatch>();
  for (const r of rows) {
    let b = map.get(r.batch_id);
    if (!b) {
      b = {
        batchId: r.batch_id,
        source: r.source,
        action: r.action,
        createdAt: r.created_at,
        confidence: null,
        model: r.model,
        reason: r.reason,
        reverted: false,
        rows: [],
      };
      map.set(r.batch_id, b);
    }
    b.rows.push(r);
    if (r.reverted_at) b.reverted = true;
    if (r.confidence !== null) b.confidence = b.confidence === null ? r.confidence : Math.min(b.confidence, r.confidence);
    if (r.source !== 'user') b.source = r.source; // a scan batch mixes AI fields and fields the user corrected
  }
  return [...map.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function canUndo(b: HistoryBatch): boolean {
  if (b.reverted) return false;
  return b.source !== 'user' || b.action === 'mark_used' || b.action === 'mark_wasted';
}

export function batchTitle(b: HistoryBatch): string {
  const who = {
    ai_scan: 'AI scan',
    ai_command: 'AI command',
    ai_recipe: 'Recipe ("I made this")',
    user: 'You',
  }[b.source];
  const what = {
    insert: 'added this item',
    update: 'changed',
    mark_used: 'marked it used',
    mark_wasted: 'marked it tossed',
  }[b.action];
  if (b.source === 'user') return `You ${what}`;
  return `${who} ${what}`;
}

export function formatLogValue(field: string | null, value: Json | null, locale: string, unit: Unit): string {
  if (value === null || value === undefined) return 'none';
  switch (field) {
    case 'quantity':
      return formatQuantity(Number(value), unit);
    case 'unit':
      return UNIT_LABEL[value as Unit] ?? String(value);
    case 'price_cents':
      return formatMoney(Number(value), locale);
    case 'category':
      return CATEGORY_LABEL[value as keyof typeof CATEGORY_LABEL] ?? String(value);
    case 'storage_location':
      return LOCATION_LABEL[value as keyof typeof LOCATION_LABEL] ?? String(value);
    case 'expiration_source':
      return SOURCE_LABEL[value as FieldSource] ?? String(value);
    case 'purchase_date':
    case 'expiration_date':
      return formatDate(String(value), locale);
    case 'opened_at':
    case 'consumed_at':
    case 'wasted_at':
      return formatDate(String(value).slice(0, 10), locale);
    case 'status':
      return { active: 'In stock', used: 'Used', wasted: 'Tossed' }[String(value)] ?? String(value);
    default:
      return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
}

export function describeRow(r: EditLogRow, locale: string, unit: Unit): string {
  const label = r.field ? (FIELD_LABEL[r.field] ?? r.field) : 'Item';
  if (r.action === 'insert') {
    if (!r.field) return 'Added by hand';
    return `${label}: ${formatLogValue(r.field, r.new_value, locale, unit)}`;
  }
  return `${label}: ${formatLogValue(r.field, r.old_value, locale, unit)} → ${formatLogValue(r.field, r.new_value, locale, unit)}`;
}
