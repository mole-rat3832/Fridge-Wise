// Turn a validated ai-command answer into operations for apply_ai_changes plus a readable preview.
// Pure functions (no I/O) so they are unit-tested with Vitest.
import type { CommandOutput } from './schemas.ts';
import {
  CATEGORIES,
  diffDays,
  isIsoDate,
  LOCATIONS,
  mapUnit,
  normalizeBarcode,
  sanitizeOptional,
  sanitizeText,
  titleCase,
} from './normalize.ts';

export interface CommandItem {
  id: string;
  name: string;
  brand: string | null;
  quantity: number;
  unit: string;
  storage_location: string;
  category: string;
  expiration_date: string | null;
  opened_at: string | null;
  user_locked_fields: string[];
}

export interface PlannedOperation {
  op: 'update' | 'mark_used' | 'mark_wasted' | 'create';
  item_id?: string;
  changes?: Record<string, unknown>;
  amount?: number | null;
  item?: Record<string, unknown>;
  reason: string;
  confidence: number;
}

export interface PreviewLine {
  item_id: string | null;
  name: string;
  text: string;
  kind: 'update' | 'used' | 'tossed' | 'create' | 'skipped';
}

export interface Plan {
  operations: PlannedOperation[];
  preview: PreviewLine[];
  problems: string[];
}

export const FIELD_LABELS: Record<string, string> = {
  name: 'name',
  brand: 'brand',
  category: 'category',
  storage_location: 'location',
  quantity: 'quantity',
  unit: 'unit',
  price_cents: 'price',
  barcode: 'barcode',
  purchase_date: 'purchase date',
  expiration_date: 'expiration date',
  opened_at: 'opened',
  notes: 'notes',
};

const fmtQty = (q: number) => String(Math.round(q * 1000) / 1000);
const unitLabel = (u: string) => (u === 'count' ? '' : ` ${u.replace('_', ' ')}`);

function formatValue(field: string, value: unknown, item?: CommandItem): string {
  if (value === null || value === undefined || value === '') return 'none';
  switch (field) {
    case 'quantity':
      return `${fmtQty(Number(value))}${unitLabel(item?.unit ?? 'count')}`;
    case 'price_cents':
      return `$${(Number(value) / 100).toFixed(2)}`;
    case 'opened_at':
      return typeof value === 'string' ? value.slice(0, 10) : String(value);
    case 'storage_location':
    case 'category':
    case 'unit':
      return String(value).replace('_', ' ');
    default:
      return String(value);
  }
}

export interface ValueContext {
  today: string;
  nowIso: string;
}

/** Parse one AI-provided value (always text) into the column type, or return an error. */
export function parseFieldValue(field: string, raw: string, ctx: ValueContext): { ok: true; value: unknown } | { ok: false; error: string } {
  const v = raw.trim();
  const isNull = v === '' || /^(null|none)$/i.test(v);
  const relativeDate = (s: string): string | null => {
    const l = s.toLowerCase();
    if (l === 'today' || l === 'now') return ctx.today;
    if (l === 'tomorrow') {
      const d = new Date(`${ctx.today}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      return d.toISOString().slice(0, 10);
    }
    return isIsoDate(s) ? s : null;
  };
  switch (field) {
    case 'name': {
      const name = titleCase(sanitizeText(v, 120));
      return name ? { ok: true, value: name } : { ok: false, error: 'empty name' };
    }
    case 'brand':
      return { ok: true, value: isNull ? null : sanitizeOptional(v, 80) };
    case 'notes':
      return { ok: true, value: isNull ? null : sanitizeOptional(v, 1000) };
    case 'category':
      return (CATEGORIES as readonly string[]).includes(v) ? { ok: true, value: v } : { ok: false, error: `unknown category ${v}` };
    case 'storage_location':
      return (LOCATIONS as readonly string[]).includes(v) ? { ok: true, value: v } : { ok: false, error: `unknown location ${v}` };
    case 'unit':
      return { ok: true, value: mapUnit(v) };
    case 'quantity': {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 && n <= 100000 ? { ok: true, value: Math.round(n * 1000) / 1000 } : { ok: false, error: 'invalid quantity' };
    }
    case 'price_cents': {
      if (isNull) return { ok: true, value: null };
      const n = Number(v.replace(/[$,]/g, ''));
      if (!Number.isFinite(n) || n < 0) return { ok: false, error: 'invalid price' };
      return { ok: true, value: v.includes('.') ? Math.round(n * 100) : Math.round(n) };
    }
    case 'barcode':
      return isNull ? { ok: true, value: null } : normalizeBarcode(v) ? { ok: true, value: normalizeBarcode(v) } : { ok: false, error: 'invalid barcode' };
    case 'purchase_date': {
      const d = relativeDate(v);
      if (!d) return { ok: false, error: 'invalid date' };
      return diffDays(d, ctx.today) <= 1 ? { ok: true, value: d } : { ok: false, error: 'purchase date in the future' };
    }
    case 'expiration_date': {
      const d = relativeDate(v);
      if (!d) return { ok: false, error: 'invalid date' };
      const delta = diffDays(d, ctx.today);
      return delta >= -30 && delta <= 365 * 3 ? { ok: true, value: d } : { ok: false, error: 'expiration date out of range' };
    }
    case 'opened_at': {
      if (isNull) return { ok: true, value: null };
      const l = v.toLowerCase();
      if (l === 'now' || l === 'today') return { ok: true, value: ctx.nowIso };
      const d = relativeDate(v);
      return d && diffDays(d, ctx.today) <= 0 ? { ok: true, value: `${d}T12:00:00Z` } : { ok: false, error: 'invalid opened date' };
    }
    default:
      return { ok: false, error: `field ${field} is not allowed` };
  }
}

/**
 * Map refs back to real item ids, drop anything that does not refer to an item that was sent,
 * parse values, and describe each change ("2% Milk: quantity 1 gal -> 0.5 gal").
 */
export function planCommand(out: CommandOutput, refs: Map<string, CommandItem>, ctx: ValueContext): Plan {
  const operations: PlannedOperation[] = [];
  const preview: PreviewLine[] = [];
  const problems: string[] = [];

  for (const op of out.operations) {
    const reason = sanitizeText(op.reason, 300);
    const confidence = Math.max(0, Math.min(1, op.confidence));

    if (op.op === 'create') {
      const ni = op.new_item;
      if (!ni) {
        problems.push('A new item was missing its details.');
        continue;
      }
      const name = titleCase(sanitizeText(ni.name, 120));
      if (!name) continue;
      const item: Record<string, unknown> = {
        name,
        category: ni.category,
        storage_location: ni.storage_location,
        quantity: Number.isFinite(ni.quantity) && ni.quantity > 0 ? Math.round(ni.quantity * 1000) / 1000 : 1,
        unit: mapUnit(ni.unit),
        purchase_date: ctx.today,
      };
      if (ni.expiration_date) {
        const parsed = parseFieldValue('expiration_date', ni.expiration_date, ctx);
        if (parsed.ok) item.expiration_date = parsed.value;
      }
      operations.push({ op: 'create', item, reason, confidence });
      preview.push({
        item_id: null,
        name,
        kind: 'create',
        text: `Add ${name} (${fmtQty(item.quantity as number)}${unitLabel(item.unit as string)}, ${item.storage_location})`,
      });
      continue;
    }

    const item = op.item_ref ? refs.get(op.item_ref) : undefined;
    if (!item) {
      problems.push(`Skipped a change for an item that is not in your list (${op.item_ref ?? 'none'}).`);
      continue;
    }

    if (op.op === 'mark_wasted') {
      operations.push({ op: 'mark_wasted', item_id: item.id, reason, confidence });
      preview.push({ item_id: item.id, name: item.name, kind: 'tossed', text: `${item.name}: mark as tossed` });
      continue;
    }

    if (op.op === 'mark_used') {
      let amount: number | null = op.amount;
      if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) amount = null;
      if (amount !== null && amount >= item.quantity) amount = null;
      operations.push({ op: 'mark_used', item_id: item.id, amount, reason, confidence });
      if (amount === null) {
        preview.push({ item_id: item.id, name: item.name, kind: 'used', text: `${item.name}: mark as used up` });
      } else {
        const left = Math.round((item.quantity - amount) * 1000) / 1000;
        preview.push({
          item_id: item.id,
          name: item.name,
          kind: 'used',
          text: `${item.name}: quantity ${formatValue('quantity', item.quantity, item)} → ${formatValue('quantity', left, item)}`,
        });
      }
      continue;
    }

    // update
    const changes: Record<string, unknown> = {};
    for (const change of op.changes) {
      const parsed = parseFieldValue(change.field, change.value, ctx);
      if (!parsed.ok) {
        problems.push(`${item.name}: ignored ${FIELD_LABELS[change.field] ?? change.field} (${parsed.error}).`);
        continue;
      }
      const current = (item as unknown as Record<string, unknown>)[change.field];
      if (current === parsed.value) continue;
      if (item.user_locked_fields.includes(change.field)) {
        preview.push({
          item_id: item.id,
          name: item.name,
          kind: 'skipped',
          text: `${item.name}: ${FIELD_LABELS[change.field] ?? change.field} stays ${formatValue(change.field, current, item)} (you set it yourself)`,
        });
        continue;
      }
      changes[change.field] = parsed.value;
    }
    if (Object.keys(changes).length === 0) continue;

    operations.push({ op: 'update', item_id: item.id, changes, reason, confidence });
    for (const [field, value] of Object.entries(changes)) {
      const current = (item as unknown as Record<string, unknown>)[field];
      let text = `${item.name}: ${FIELD_LABELS[field] ?? field} ${formatValue(field, current, item)} → ${formatValue(field, value, item)}`;
      if (field === 'storage_location' && (value === 'freezer' || item.storage_location === 'freezer') && !item.user_locked_fields.includes('expiration_date') && !('expiration_date' in changes)) {
        text += ' (expiration date will be recalculated)';
      }
      if (field === 'opened_at' && value && !item.opened_at && !item.user_locked_fields.includes('expiration_date') && !('expiration_date' in changes)) {
        text += ' (expiration date may move earlier)';
      }
      preview.push({ item_id: item.id, name: item.name, kind: 'update', text });
    }
  }

  return { operations, preview, problems };
}
