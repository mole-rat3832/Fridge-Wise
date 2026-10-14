// Turn validated Gemini output into scan_items rows.
// Pure functions (no I/O) so they are unit-tested with Vitest.
import type { ProductOutput, ReceiptOutput } from './schemas.ts';
import {
  type Category,
  clamp01,
  decideExpiration,
  type ExpirationSource,
  isPlausiblePrintedDate,
  isPlausiblePurchaseDate,
  type Location,
  mergeDuplicateLines,
  type NormalizedLine,
  normalizeBarcode,
  normalizeQuantity,
  parsePrintedDate,
  type PrintedDateType,
  sanitizeOptional,
  sanitizeText,
  titleCase,
  toCents,
  type Unit,
} from './normalize.ts';

export interface ScanContext {
  locale: string;
  today: string; // YYYY-MM-DD in the user's timezone
}

export interface ShelfLifeMatch {
  index: number;
  days: number | null;
  keyword: string | null;
  matched_by: 'keyword' | 'category' | null;
}

export interface ScanItemRow {
  position: number;
  raw_text: string | null;
  name: string;
  brand: string | null;
  category: Category;
  storage_location: Location;
  quantity: number;
  unit: Unit;
  price_cents: number | null;
  barcode: string | null;
  printed_date: string | null;
  printed_date_type: PrintedDateType | null;
  estimated_expiration_date: string | null;
  expiration_source: ExpirationSource | null;
  storage_instructions: string | null;
  field_confidence: Record<string, number>;
  confidence: number;
  is_food: boolean;
}

interface Candidate extends NormalizedLine {
  barcode: string | null;
  printed_date: string | null;
  printed_date_type: PrintedDateType | null;
  printed_confidence: number;
  storage_instructions: string | null;
}

export interface NormalizedScan {
  store_name: string | null;
  purchase_date: string | null;
  purchase_date_confidence: number;
  candidates: Candidate[];
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

// ---------------------------------------------------------------------------
// Receipt
// ---------------------------------------------------------------------------
export function normalizeReceipt(out: ReceiptOutput, ctx: ScanContext): NormalizedScan {
  // Purchase date: read the printed text ourselves so ambiguous dates follow the user's locale.
  const parsed = parsePrintedDate(out.purchase_date_raw, out.purchase_date, ctx.locale, ctx.today);
  let purchaseDate = parsed.date;
  let purchaseConfidence = clamp01(out.purchase_date_confidence, 0.6);
  if (parsed.ambiguous) purchaseConfidence = Math.min(purchaseConfidence, 0.5);
  if (purchaseDate && !isPlausiblePurchaseDate(purchaseDate, ctx.today)) {
    purchaseDate = null;
  }
  if (!purchaseDate) purchaseConfidence = 0.4;

  const lines: NormalizedLine[] = out.items
    .map((line) => {
      const { quantity, unit } = normalizeQuantity(line.quantity, line.unit);
      const c = line.confidence ?? {};
      const name = titleCase(sanitizeText(line.name, 120)) || titleCase(sanitizeText(line.raw_text, 120)) || 'Item';
      const brand = sanitizeOptional(line.brand, 80);
      return {
        raw_text: sanitizeText(line.raw_text, 500),
        name,
        brand: brand ? titleCase(brand) : null,
        quantity,
        unit,
        price_cents: toCents(line.price),
        is_food: line.is_food && (line.price === null || line.price >= 0),
        category: line.category,
        storage_location: line.storage_location,
        estimated_shelf_life_days: typeof line.estimated_shelf_life_days === 'number' ? line.estimated_shelf_life_days : null,
        confidence: {
          name: clamp01(c.name),
          brand: clamp01(c.brand),
          quantity: line.quantity === null ? Math.min(clamp01(c.quantity), 0.6) : clamp01(c.quantity),
          unit: clamp01(c.unit),
          price_cents: clamp01(c.price),
          category: clamp01(c.category),
          storage_location: clamp01(c.storage_location),
          is_food: clamp01(c.is_food),
        },
      } satisfies NormalizedLine;
    })
    .filter((l) => l.name.length > 0);

  const merged = mergeDuplicateLines(lines);
  return {
    store_name: sanitizeOptional(out.store_name, 120),
    purchase_date: purchaseDate,
    purchase_date_confidence: purchaseConfidence,
    candidates: merged.map((l) => ({
      ...l,
      barcode: null,
      printed_date: null,
      printed_date_type: null,
      printed_confidence: 0,
      storage_instructions: null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Single product
// ---------------------------------------------------------------------------
export function normalizeProduct(out: ProductOutput, ctx: ScanContext): NormalizedScan {
  const c = out.confidence ?? {};
  const { quantity, unit } = normalizeQuantity(out.quantity, out.unit);

  let printedConfidence = clamp01(c.printed_date, 0.6);
  let printedDate: string | null = null;
  if (out.printed_date_raw || out.printed_date) {
    const parsed = parsePrintedDate(out.printed_date_raw, out.printed_date, ctx.locale, ctx.today);
    printedDate = parsed.date;
    if (parsed.ambiguous) printedConfidence = Math.min(printedConfidence, 0.5);
    // Reject printed dates more than 30 days in the past or more than 3 years ahead.
    if (printedDate && !isPlausiblePrintedDate(printedDate, ctx.today)) printedDate = null;
  }

  const brand = sanitizeOptional(out.brand, 80);
  const candidate: Candidate = {
    raw_text: '',
    name: titleCase(sanitizeText(out.name, 120)) || 'Item',
    brand: brand ? titleCase(brand) : null,
    quantity,
    unit,
    price_cents: null,
    is_food: out.is_food,
    category: out.category,
    storage_location: out.storage_location,
    estimated_shelf_life_days: typeof out.estimated_shelf_life_days === 'number' ? out.estimated_shelf_life_days : null,
    confidence: {
      name: clamp01(c.name),
      brand: clamp01(c.brand),
      quantity: out.quantity === null ? Math.min(clamp01(c.quantity), 0.6) : clamp01(c.quantity),
      unit: clamp01(c.unit),
      category: clamp01(c.category),
      storage_location: clamp01(c.storage_location),
      barcode: clamp01(c.barcode),
    },
    barcode: normalizeBarcode(out.barcode),
    printed_date: printedDate,
    printed_date_type: printedDate ? (out.printed_date_type ?? 'other') : null,
    printed_confidence: printedConfidence,
    storage_instructions: sanitizeOptional(out.storage_instructions, 300),
  };
  return { store_name: null, purchase_date: ctx.today, purchase_date_confidence: 1, candidates: [candidate] };
}

// ---------------------------------------------------------------------------
// Expiration + final rows
// ---------------------------------------------------------------------------
export function shelfLifeRequest(scan: NormalizedScan) {
  return scan.candidates.map((c) => ({ name: c.name, category: c.category, storage_location: c.storage_location, opened: false }));
}

export function buildScanItems(scan: NormalizedScan, shelf: ShelfLifeMatch[], ctx: ScanContext): ScanItemRow[] {
  const baseDate = scan.purchase_date ?? ctx.today;
  return scan.candidates.map((c, i) => {
    const match = shelf.find((s) => s.index === i) ?? null;
    const exp = c.is_food
      ? decideExpiration({
          printedDate: c.printed_date,
          printedConfidence: c.printed_confidence,
          shelfLifeDays: match?.days ?? null,
          shelfLifeMatchedBy: match?.matched_by ?? null,
          aiEstimateDays: c.estimated_shelf_life_days,
          location: c.storage_location,
          baseDate,
          purchaseDate: scan.purchase_date ?? ctx.today,
        })
      : { date: null, source: null, confidence: 0 };

    const field_confidence: Record<string, number> = {
      ...Object.fromEntries(Object.entries(c.confidence).map(([k, v]) => [k, round3(v)])),
      purchase_date: round3(scan.purchase_date_confidence),
    };
    if (exp.date) field_confidence.expiration_date = round3(exp.confidence);
    if (c.price_cents === null) delete field_confidence.price_cents;

    const keyFields = [field_confidence.name, field_confidence.category, field_confidence.quantity];
    if (c.is_food && exp.date) keyFields.push(field_confidence.expiration_date);
    const confidence = round3(Math.min(...keyFields.filter((v) => typeof v === 'number')));

    return {
      position: i,
      raw_text: c.raw_text || null,
      name: c.name,
      brand: c.brand,
      category: c.category,
      storage_location: c.storage_location,
      quantity: c.quantity,
      unit: c.unit,
      price_cents: c.price_cents,
      barcode: c.barcode,
      printed_date: c.printed_date,
      printed_date_type: c.printed_date_type,
      estimated_expiration_date: exp.date,
      expiration_source: exp.source,
      storage_instructions: c.storage_instructions,
      field_confidence,
      confidence,
      is_food: c.is_food,
    };
  });
}
