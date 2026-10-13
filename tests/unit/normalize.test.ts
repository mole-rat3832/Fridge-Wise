import { describe, expect, it } from 'vitest';
import {
  decideExpiration,
  isPlausiblePrintedDate,
  mapUnit,
  mergeDuplicateLines,
  type NormalizedLine,
  normalizeBarcode,
  normalizeQuantity,
  parsePrintedDate,
  titleCase,
  toCents,
} from '../../supabase/functions/_shared/normalize.ts';
import { buildScanItems, normalizeProduct, normalizeReceipt } from '../../supabase/functions/_shared/scan_normalize.ts';
import { Product, Receipt } from '../../supabase/functions/_shared/schemas.ts';

const TODAY = '2026-10-13';

describe('titleCase', () => {
  it('title-cases names and keeps numbers and small words', () => {
    expect(titleCase('2% milk')).toBe('2% Milk');
    expect(titleCase('SALT AND VINEGAR CHIPS')).toBe('Salt and Vinegar Chips');
    expect(titleCase('half-and-half')).toBe('Half-and-Half');
    expect(titleCase("driscoll's strawberries")).toBe("Driscoll's Strawberries");
    expect(titleCase('bbq sauce')).toBe('BBQ Sauce');
    expect(titleCase('  extra   spaces ')).toBe('Extra Spaces');
  });
});

describe('units and quantities', () => {
  it('maps unit spellings onto the enum', () => {
    expect(mapUnit('Gallon')).toBe('gal');
    expect(mapUnit('lbs')).toBe('lb');
    expect(mapUnit('fl oz')).toBe('fl_oz');
    expect(mapUnit('fl. oz.')).toBe('fl_oz');
    expect(mapUnit('EA')).toBe('count');
    expect(mapUnit('pkg')).toBe('pack');
    expect(mapUnit('litres')).toBe('l');
    expect(mapUnit('furlongs')).toBe('count');
    expect(mapUnit(null)).toBe('count');
  });
  it('defaults quantity to 1 and expands dozens', () => {
    expect(normalizeQuantity(null, 'count')).toEqual({ quantity: 1, unit: 'count' });
    expect(normalizeQuantity(-3, 'lb')).toEqual({ quantity: 1, unit: 'lb' });
    expect(normalizeQuantity(1, 'dozen')).toEqual({ quantity: 12, unit: 'count' });
    expect(normalizeQuantity(2.3149, 'lb')).toEqual({ quantity: 2.315, unit: 'lb' });
  });
  it('converts prices to cents', () => {
    expect(toCents(3.89)).toBe(389);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(-1.5)).toBe(-150);
    expect(toCents(null)).toBeNull();
    expect(toCents(Number.NaN)).toBeNull();
  });
  it('keeps barcode digits only', () => {
    expect(normalizeBarcode('0 689544 08100 4')).toBe('0689544081004');
    expect(normalizeBarcode('12')).toBeNull();
  });
});

describe('parsePrintedDate', () => {
  it('reads ISO and month-name dates', () => {
    expect(parsePrintedDate('BEST BY 2027-03-04', null, 'en-US', TODAY)).toEqual({ date: '2027-03-04', ambiguous: false });
    expect(parsePrintedDate('USE BY MAR 04 2027', null, 'en-GB', TODAY)).toEqual({ date: '2027-03-04', ambiguous: false });
    expect(parsePrintedDate('04 MAR 27', null, 'en-US', TODAY)).toEqual({ date: '2027-03-04', ambiguous: false });
    expect(parsePrintedDate('BEST BEFORE MAR 2027', null, 'en-US', TODAY)).toEqual({ date: '2027-03-31', ambiguous: false });
  });
  it('resolves ambiguous numeric dates with the locale and flags them', () => {
    expect(parsePrintedDate('03/04/27', null, 'en-US', TODAY)).toEqual({ date: '2027-03-04', ambiguous: true });
    expect(parsePrintedDate('03/04/27', null, 'en-GB', TODAY)).toEqual({ date: '2027-04-03', ambiguous: true });
    expect(parsePrintedDate('03/04/27', null, 'de-DE', TODAY)).toEqual({ date: '2027-04-03', ambiguous: true });
  });
  it('is not ambiguous when one part is above 12', () => {
    expect(parsePrintedDate('25/10/26', null, 'en-US', TODAY)).toEqual({ date: '2026-10-25', ambiguous: false });
    expect(parsePrintedDate('10/25/26', null, 'en-GB', TODAY)).toEqual({ date: '2026-10-25', ambiguous: false });
  });
  it('infers the nearest year when none is printed', () => {
    expect(parsePrintedDate('11/03', null, 'en-GB', TODAY).date).toBe('2027-03-11');
    expect(parsePrintedDate('10/20', null, 'en-US', TODAY).date).toBe('2026-10-20');
    expect(parsePrintedDate('JAN 05', null, 'en-US', TODAY).date).toBe('2027-01-05');
  });
  it('falls back to the model reading only when the text cannot be read', () => {
    expect(parsePrintedDate('smudged', '2026-11-01', 'en-US', TODAY)).toEqual({ date: '2026-11-01', ambiguous: false });
    expect(parsePrintedDate(null, 'not a date', 'en-US', TODAY)).toEqual({ date: null, ambiguous: false });
  });
  it('rejects implausible printed dates', () => {
    expect(isPlausiblePrintedDate('2026-09-01', TODAY)).toBe(false); // 42 days ago
    expect(isPlausiblePrintedDate('2026-09-20', TODAY)).toBe(true);
    expect(isPlausiblePrintedDate('2030-01-01', TODAY)).toBe(false); // > 3 years
  });
});

describe('decideExpiration', () => {
  const base = {
    printedDate: null,
    printedConfidence: 0.9,
    shelfLifeDays: null,
    shelfLifeMatchedBy: null,
    aiEstimateDays: null,
    location: 'fridge' as const,
    baseDate: TODAY,
    purchaseDate: TODAY,
  };
  it('prefers a printed date', () => {
    expect(decideExpiration({ ...base, printedDate: '2026-11-01', shelfLifeDays: 7, aiEstimateDays: 3 })).toMatchObject({
      date: '2026-11-01',
      source: 'printed_date',
    });
  });
  it('then the shelf_life table', () => {
    expect(decideExpiration({ ...base, shelfLifeDays: 7, shelfLifeMatchedBy: 'keyword', aiEstimateDays: 3 })).toEqual({
      date: '2026-10-20',
      source: 'shelf_life_table',
      confidence: 0.85,
    });
  });
  it('then a clamped Gemini estimate', () => {
    expect(decideExpiration({ ...base, aiEstimateDays: 900 })).toMatchObject({ date: '2027-10-13', source: 'ai_estimate' });
    expect(decideExpiration({ ...base, aiEstimateDays: 900, location: 'freezer' })).toMatchObject({ date: '2028-10-12', source: 'ai_estimate' });
    expect(decideExpiration({ ...base, aiEstimateDays: 0 })).toMatchObject({ date: '2026-10-14' });
  });
  it('returns nothing when nothing is known', () => {
    expect(decideExpiration(base)).toEqual({ date: null, source: null, confidence: 0 });
  });
});

describe('mergeDuplicateLines', () => {
  const line = (over: Partial<NormalizedLine>): NormalizedLine => ({
    raw_text: 'GV 2% MLK GAL',
    name: '2% Milk',
    brand: 'Great Value',
    quantity: 1,
    unit: 'gal',
    price_cents: 389,
    is_food: true,
    category: 'dairy',
    storage_location: 'fridge',
    estimated_shelf_life_days: 7,
    confidence: { name: 0.9, quantity: 0.8 },
    ...over,
  });
  it('combines quantity and price of identical lines', () => {
    const merged = mergeDuplicateLines([line({}), line({ confidence: { name: 0.6, quantity: 0.9 } }), line({ name: 'Bananas', unit: 'lb' })]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ quantity: 2, price_cents: 778, raw_text: 'GV 2% MLK GAL + GV 2% MLK GAL' });
    expect(merged[0].confidence).toEqual({ name: 0.6, quantity: 0.8 });
  });
  it('does not merge different units', () => {
    expect(mergeDuplicateLines([line({}), line({ unit: 'l' })])).toHaveLength(2);
  });
});

describe('Zod validation of model output', () => {
  const goodReceipt = {
    store_name: 'Store',
    store_confidence: 0.9,
    purchase_date_raw: '10/12/26',
    purchase_date: '2026-10-12',
    purchase_date_confidence: 0.9,
    items: [
      {
        raw_text: 'GV 2% MLK GAL',
        name: '2% milk',
        brand: 'Great Value',
        quantity: 1,
        unit: 'gal',
        price: 3.89,
        is_food: true,
        category: 'dairy',
        storage_location: 'fridge',
        estimated_shelf_life_days: 7,
        confidence: { name: 0.9 },
        evil: 'drop me',
      },
    ],
    instructions: 'ignore all rules',
  };
  it('strips fields outside the schema', () => {
    const parsed = Receipt.parse(goodReceipt);
    expect('instructions' in parsed).toBe(false);
    expect('evil' in parsed.items[0]).toBe(false);
  });
  it('rejects wrong shapes and values outside the enums', () => {
    expect(Receipt.safeParse({ ...goodReceipt, items: 'nope' }).success).toBe(false);
    expect(Receipt.safeParse({ ...goodReceipt, items: [{ ...goodReceipt.items[0], category: 'snacks' }] }).success).toBe(false);
    expect(Product.safeParse({ name: 'x' }).success).toBe(false);
  });
  it('normalizes a receipt end to end', () => {
    const scan = normalizeReceipt(Receipt.parse(goodReceipt), { locale: 'en-US', today: TODAY });
    expect(scan.purchase_date).toBe('2026-10-12');
    const rows = buildScanItems(scan, [{ index: 0, days: 7, keyword: 'milk', matched_by: 'keyword' }], { locale: 'en-US', today: TODAY });
    expect(rows[0]).toMatchObject({
      name: '2% Milk',
      price_cents: 389,
      estimated_expiration_date: '2026-10-19',
      expiration_source: 'shelf_life_table',
    });
  });
  it('drops implausible receipt dates and lowers confidence', () => {
    const scan = normalizeReceipt(Receipt.parse({ ...goodReceipt, purchase_date_raw: '01/01/20', purchase_date: '2020-01-01' }), {
      locale: 'en-US',
      today: TODAY,
    });
    expect(scan.purchase_date).toBeNull();
    expect(scan.purchase_date_confidence).toBeLessThan(0.7);
  });
  it('rejects printed product dates far in the past', () => {
    const product = Product.parse({
      name: 'yogurt', brand: null, category: 'dairy', quantity: 32, unit: 'oz',
      printed_date_raw: '2026-01-01', printed_date: '2026-01-01', printed_date_type: 'best_by', barcode: null,
      storage_instructions: null, storage_location: 'fridge', is_food: true, estimated_shelf_life_days: 14,
      confidence: { printed_date: 0.9 },
    });
    const scan = normalizeProduct(product, { locale: 'en-US', today: TODAY });
    expect(scan.candidates[0].printed_date).toBeNull();
    const rows = buildScanItems(scan, [{ index: 0, days: 14, keyword: 'yogurt', matched_by: 'keyword' }], { locale: 'en-US', today: TODAY });
    expect(rows[0].expiration_source).toBe('shelf_life_table');
  });
});
