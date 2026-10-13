import { describe, expect, it } from 'vitest';
import { type CommandItem, parseFieldValue, planCommand } from '../../supabase/functions/_shared/commands.ts';
import { Command } from '../../supabase/functions/_shared/schemas.ts';

const ctx = { today: '2026-10-13', nowIso: '2026-10-13T15:00:00.000Z' };

const milk: CommandItem = {
  id: '00000000-0000-4000-8000-000000000001',
  name: '2% Milk',
  brand: null,
  quantity: 1,
  unit: 'gal',
  storage_location: 'fridge',
  category: 'dairy',
  expiration_date: '2026-10-19',
  opened_at: null,
  user_locked_fields: [],
};
const chicken: CommandItem = {
  ...milk,
  id: '00000000-0000-4000-8000-000000000002',
  name: 'Chicken Breast',
  quantity: 2,
  unit: 'lb',
  category: 'meat',
  user_locked_fields: ['expiration_date'],
};
const refs = new Map([
  ['i1', milk],
  ['i2', chicken],
]);

const op = (o: Record<string, unknown>) => ({ item_ref: null, amount: null, changes: [], reason: 'r', confidence: 0.9, ...o });

describe('planCommand', () => {
  it('previews partial use as a quantity change', () => {
    const out = Command.parse({ operations: [op({ op: 'mark_used', item_ref: 'i1', amount: 0.5 })], clarification: null });
    const plan = planCommand(out, refs, ctx);
    expect(plan.operations).toEqual([{ op: 'mark_used', item_id: milk.id, amount: 0.5, reason: 'r', confidence: 0.9 }]);
    expect(plan.preview[0].text).toBe('2% Milk: quantity 1 gal → 0.5 gal');
  });
  it('treats using more than is left as using all of it', () => {
    const out = Command.parse({ operations: [op({ op: 'mark_used', item_ref: 'i1', amount: 5 })], clarification: null });
    expect(planCommand(out, refs, ctx).operations[0].amount).toBeNull();
  });
  it('drops operations on items that were not sent', () => {
    const out = Command.parse({ operations: [op({ op: 'mark_wasted', item_ref: 'i9' })], clarification: null });
    const plan = planCommand(out, refs, ctx);
    expect(plan.operations).toHaveLength(0);
    expect(plan.problems[0]).toMatch(/not in your list/);
  });
  it('never proposes changes to locked fields and says so', () => {
    const out = Command.parse({
      operations: [
        op({
          op: 'update',
          item_ref: 'i2',
          changes: [
            { field: 'expiration_date', value: '2026-10-30' },
            { field: 'storage_location', value: 'freezer' },
          ],
        }),
      ],
      clarification: null,
    });
    const plan = planCommand(out, refs, ctx);
    expect(plan.operations[0].changes).toEqual({ storage_location: 'freezer' });
    expect(plan.preview.find((p) => p.kind === 'skipped')?.text).toContain('you set it yourself');
    // expiration is locked, so no "recalculated" note
    expect(plan.preview.find((p) => p.kind === 'update')?.text).toBe('Chicken Breast: location fridge → freezer');
  });
  it('notes that a freezer move recalculates the date', () => {
    const out = Command.parse({
      operations: [op({ op: 'update', item_ref: 'i1', changes: [{ field: 'storage_location', value: 'freezer' }] })],
      clarification: null,
    });
    expect(planCommand(out, refs, ctx).preview[0].text).toContain('recalculated');
  });
  it('rejects values that fail validation', () => {
    const out = Command.parse({
      operations: [op({ op: 'update', item_ref: 'i1', changes: [{ field: 'quantity', value: '-2' }] })],
      clarification: null,
    });
    const plan = planCommand(out, refs, ctx);
    expect(plan.operations).toHaveLength(0);
    expect(plan.problems[0]).toContain('invalid quantity');
  });
  it('plans a create with defaults', () => {
    const out = Command.parse({
      operations: [
        op({
          op: 'create',
          new_item: { name: 'blueberries', category: 'produce', storage_location: 'fridge', quantity: 1, unit: 'pint', expiration_date: null },
        }),
      ],
      clarification: null,
    });
    const plan = planCommand(out, refs, ctx);
    expect(plan.operations[0].item).toMatchObject({ name: 'Blueberries', unit: 'count', purchase_date: '2026-10-13' });
  });
  it('does not allow non-whitelisted fields', () => {
    expect(
      Command.safeParse({ operations: [op({ op: 'update', item_ref: 'i1', changes: [{ field: 'status', value: 'used' }] })], clarification: null })
        .success,
    ).toBe(false);
    expect(Command.safeParse({ operations: [op({ op: 'delete', item_ref: 'i1' })], clarification: null }).success).toBe(false);
  });
});

describe('parseFieldValue', () => {
  it('parses each field type', () => {
    expect(parseFieldValue('opened_at', 'now', ctx)).toEqual({ ok: true, value: ctx.nowIso });
    expect(parseFieldValue('expiration_date', 'tomorrow', ctx)).toEqual({ ok: true, value: '2026-10-14' });
    expect(parseFieldValue('price_cents', '3.49', ctx)).toEqual({ ok: true, value: 349 });
    expect(parseFieldValue('price_cents', '349', ctx)).toEqual({ ok: true, value: 349 });
    expect(parseFieldValue('category', 'snacks', ctx).ok).toBe(false);
    expect(parseFieldValue('expiration_date', '2031-01-01', ctx).ok).toBe(false);
    expect(parseFieldValue('purchase_date', '2026-12-01', ctx).ok).toBe(false);
  });
});
