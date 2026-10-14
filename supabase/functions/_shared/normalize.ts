// Pure normalization helpers shared by the edge functions.
// No Deno or npm imports here so the same file is unit-tested with Vitest (src/tests).

export const UNITS = ['count', 'g', 'kg', 'oz', 'lb', 'ml', 'l', 'fl_oz', 'gal', 'pack'] as const;
export type Unit = (typeof UNITS)[number];

export const CATEGORIES = [
  'produce', 'dairy', 'meat', 'seafood', 'eggs', 'bakery', 'frozen',
  'pantry', 'beverages', 'condiments', 'leftovers', 'other',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const LOCATIONS = ['fridge', 'freezer', 'pantry'] as const;
export type Location = (typeof LOCATIONS)[number];

export const PRINTED_DATE_TYPES = ['best_by', 'use_by', 'sell_by', 'expires', 'freeze_by', 'other'] as const;
export type PrintedDateType = (typeof PRINTED_DATE_TYPES)[number];

/** Fields the AI may set on food_items (mirrors private.ai_writable_fields()). */
export const AI_WRITABLE_FIELDS = [
  'name', 'brand', 'category', 'storage_location', 'quantity', 'unit', 'price_cents',
  'barcode', 'purchase_date', 'expiration_date', 'expiration_source', 'opened_at', 'notes',
] as const;
export type AiWritableField = (typeof AI_WRITABLE_FIELDS)[number];

/** Confidence below this is highlighted in the review screen ("check this"). */
export const LOW_CONFIDENCE = 0.7;

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/** Strip control characters, collapse whitespace and cap the length. */
export function sanitizeText(value: unknown, max = 120): string {
  if (typeof value !== 'string') return '';
  // Intentional: strip control characters from model output.
  // deno-lint-ignore no-control-regex
  // oxlint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function sanitizeOptional(value: unknown, max = 120): string | null {
  const s = sanitizeText(value, max);
  return s === '' ? null : s;
}

const SMALL_WORDS = new Set(['a', 'an', 'and', 'or', 'of', 'the', 'in', 'with', 'for', 'to', 'on', 'de', 'la', 'n']);
const ACRONYMS = new Set(['bbq', 'usa', 'xl', 'xxl', 'ipa', 'oj', 'gf', 'blt', 'pb', 'uht', 'vg']);

function capitalizeWord(word: string): string {
  const lower = word.toLowerCase();
  if (ACRONYMS.has(lower)) return lower.toUpperCase();
  // Capitalize the first letter, including after a hyphen ("half-and-half" -> "Half-and-Half").
  return lower
    .split('-')
    .map((part, i) => {
      if (i > 0 && SMALL_WORDS.has(part)) return part;
      const idx = part.search(/\p{L}/u);
      if (idx < 0) return part;
      return part.slice(0, idx) + part[idx].toUpperCase() + part.slice(idx + 1);
    })
    .join('-');
}

/** Title-case a product name: "2% milk" -> "2% Milk", "salt and vinegar chips" -> "Salt and Vinegar Chips". */
export function titleCase(input: string): string {
  const words = sanitizeText(input).split(' ').filter(Boolean);
  return words
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w.toLowerCase()) ? w.toLowerCase() : capitalizeWord(w)))
    .join(' ');
}

// ---------------------------------------------------------------------------
// Units and quantities
// ---------------------------------------------------------------------------

const UNIT_ALIASES: Record<string, Unit> = {
  count: 'count', ct: 'count', ea: 'count', each: 'count', pc: 'count', pcs: 'count', piece: 'count',
  pieces: 'count', unit: 'count', units: 'count', item: 'count', items: 'count', x: 'count', '': 'count',
  dozen: 'count', dz: 'count', doz: 'count',
  g: 'g', gr: 'g', gram: 'g', grams: 'g', gm: 'g',
  kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg',
  oz: 'oz', ounce: 'oz', ounces: 'oz', ozs: 'oz',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb', '#': 'lb',
  ml: 'ml', milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml',
  l: 'l', lt: 'l', ltr: 'l', liter: 'l', liters: 'l', litre: 'l', litres: 'l',
  floz: 'fl_oz', fl_oz: 'fl_oz', 'fl.oz': 'fl_oz', fluidounce: 'fl_oz', fluidounces: 'fl_oz',
  gal: 'gal', gallon: 'gal', gallons: 'gal', gl: 'gal',
  pack: 'pack', pk: 'pack', pkg: 'pack', package: 'pack', packs: 'pack', bag: 'pack', box: 'pack',
  carton: 'pack', bunch: 'pack', bottle: 'pack', can: 'pack', jar: 'pack', tub: 'pack', case: 'pack',
};

/** Map any unit spelling onto the unit enum. Unknown units become "count". */
export function mapUnit(raw: unknown): Unit {
  if (typeof raw !== 'string') return 'count';
  const key = raw.toLowerCase().replace(/[\s.]+/g, '').replace(/^fl_?oz$/, 'floz');
  if ((UNITS as readonly string[]).includes(key)) return key as Unit;
  return UNIT_ALIASES[key] ?? UNIT_ALIASES[key.replace(/s$/, '')] ?? 'count';
}

function isDozen(raw: unknown): boolean {
  return typeof raw === 'string' && /^(dozen|dz|doz)$/i.test(raw.trim());
}

/** Quantity defaults to 1; "dozen" becomes 12 count; values are rounded to 3 decimals. */
export function normalizeQuantity(quantity: unknown, rawUnit: unknown): { quantity: number; unit: Unit } {
  let q = typeof quantity === 'number' && Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
  const unit = mapUnit(rawUnit);
  if (isDozen(rawUnit)) q *= 12;
  q = Math.min(Math.round(q * 1000) / 1000, 100000);
  return { quantity: q, unit };
}

/** Money to integer cents. */
export function toCents(price: unknown): number | null {
  if (typeof price !== 'number' || !Number.isFinite(price)) return null;
  const cents = Math.round(price * 100);
  return Math.max(-10_000_000, Math.min(10_000_000, cents));
}

export function normalizeBarcode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 6 && digits.length <= 14 ? digits : null;
}

export function clamp01(n: unknown, fallback = 0.5): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

export function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

// ---------------------------------------------------------------------------
// Dates (all ISO YYYY-MM-DD, computed on UTC midnights to avoid DST issues)
// ---------------------------------------------------------------------------

export function isIsoDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}

/** Today's date in a timezone, as YYYY-MM-DD. */
export function todayIn(timeZone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

function toIso(y: number, m: number, d: number): string | null {
  const iso = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return isIsoDate(iso) ? iso : null;
}

function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Month-first locales read 03/04 as March 4. Everyone else reads it as 3 April. */
export function prefersMonthFirst(locale: string): boolean {
  return /^en-(US|PH|AS|GU|MP|PR|UM|VI)$/i.test(locale) || /^(en|es)-US$/i.test(locale) || locale === 'en';
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9,
  october: 10, november: 11, december: 12,
};

function expandYear(y: number): number {
  return y < 100 ? 2000 + y : y;
}

/** Pick the year that puts month/day closest to today (printed dates without a year). */
function inferYear(month: number, day: number, today: string): string | null {
  const year = Number(today.slice(0, 4));
  let best: string | null = null;
  let bestDist = Infinity;
  for (const y of [year - 1, year, year + 1]) {
    const iso = toIso(y, month, day);
    if (!iso) continue;
    const dist = Math.abs(diffDays(iso, today));
    if (dist < bestDist) {
      best = iso;
      bestDist = dist;
    }
  }
  return best;
}

export interface ParsedDate {
  date: string | null;
  ambiguous: boolean;
}

/**
 * Read a date exactly as printed ("03/04/27", "BEST BY MAR 04 2027", "2027-03-04").
 * Ambiguous day/month orders are resolved with the user's locale and flagged so the caller
 * can lower the confidence. Falls back to the model's ISO interpretation when the raw text
 * cannot be read.
 */
export function parsePrintedDate(raw: unknown, isoGuess: unknown, locale: string, today: string): ParsedDate {
  const text = typeof raw === 'string' ? raw.toLowerCase() : '';

  // ISO-like: 2027-03-04, 2027/03/04, 2027.03.04
  let m = text.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return { date: toIso(+m[1], +m[2], +m[3]), ambiguous: false };

  // Numeric a/b/y or a/b
  m = text.match(/(?<!\d)(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?(?!\d)/);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    const hasYear = m[3] !== undefined;
    let month: number;
    let day: number;
    let ambiguous = false;
    if (a > 12 && b <= 12) {
      day = a;
      month = b;
    } else if (b > 12 && a <= 12) {
      month = a;
      day = b;
    } else {
      ambiguous = a !== b;
      if (prefersMonthFirst(locale)) {
        month = a;
        day = b;
      } else {
        day = a;
        month = b;
      }
    }
    if (hasYear) {
      const y = expandYear(+m[3]!);
      return { date: toIso(y, month, day), ambiguous };
    }
    // Two numbers where the second cannot be a day are MM/YY ("03/45" = March 2045).
    if (b > 31 && a <= 12) {
      const y = expandYear(b);
      return { date: toIso(y, a, lastDayOfMonth(y, a)), ambiguous: true };
    }
    return { date: inferYear(month, day, today), ambiguous: true };
  }

  // Month names: "mar 04 2027", "04 mar 27", "mar 2027", "march 4"
  m = text.match(/(\d{1,2})\s*([a-z]{3,9})\.?\s*(\d{2,4})?/);
  if (m && MONTHS[m[2]]) {
    const month = MONTHS[m[2]];
    const day = +m[1];
    if (m[3]) return { date: toIso(expandYear(+m[3]), month, day), ambiguous: false };
    return { date: inferYear(month, day, today), ambiguous: false };
  }
  m = text.match(/([a-z]{3,9})\.?\s*(\d{1,2})(?:st|nd|rd|th)?\b,?\s*(\d{2,4})?/);
  if (m && MONTHS[m[1]]) {
    const month = MONTHS[m[1]];
    const n = +m[2];
    if (m[3]) return { date: toIso(expandYear(+m[3]), month, n), ambiguous: false };
    return { date: inferYear(month, n, today), ambiguous: false };
  }
  m = text.match(/([a-z]{3,9})\.?\s*(\d{4})/);
  if (m && MONTHS[m[1]]) {
    const y = +m[2];
    const month = MONTHS[m[1]];
    // "Best by MAR 2027" means the end of that month.
    return { date: toIso(y, month, lastDayOfMonth(y, month)), ambiguous: false };
  }

  if (isIsoDate(isoGuess)) return { date: isoGuess, ambiguous: false };
  return { date: null, ambiguous: false };
}

/** Printed dates more than 30 days in the past or 3 years in the future are rejected. */
export function isPlausiblePrintedDate(date: string, today: string): boolean {
  const d = diffDays(date, today);
  return d >= -30 && d <= 365 * 3 + 1;
}

/** Receipt purchase dates must be within the last year and not in the future. */
export function isPlausiblePurchaseDate(date: string, today: string): boolean {
  const d = diffDays(date, today);
  return d <= 1 && d >= -365;
}

// ---------------------------------------------------------------------------
// Expiration priority: printed date > shelf_life table > Gemini estimate
// ---------------------------------------------------------------------------

export type ExpirationSource = 'printed_date' | 'shelf_life_table' | 'ai_estimate';

export interface ExpirationInput {
  printedDate: string | null;
  printedConfidence: number;
  shelfLifeDays: number | null;
  shelfLifeMatchedBy: 'keyword' | 'category' | null;
  aiEstimateDays: number | null;
  location: Location;
  baseDate: string; // purchase date (receipt) or today (product)
  purchaseDate: string | null;
}

export interface ExpirationResult {
  date: string | null;
  source: ExpirationSource | null;
  confidence: number;
}

export function decideExpiration(input: ExpirationInput): ExpirationResult {
  const limit = input.purchaseDate ? addDays(input.purchaseDate, 365 * 3) : null;
  const cap = (d: string) => (limit && d > limit ? limit : d);

  if (input.printedDate) {
    return { date: cap(input.printedDate), source: 'printed_date', confidence: clamp01(input.printedConfidence) };
  }
  if (input.shelfLifeDays !== null && input.shelfLifeDays > 0) {
    return {
      date: cap(addDays(input.baseDate, input.shelfLifeDays)),
      source: 'shelf_life_table',
      // A keyword match is specific; a category default is a rough guess worth checking.
      confidence: input.shelfLifeMatchedBy === 'keyword' ? 0.85 : 0.65,
    };
  }
  if (input.aiEstimateDays !== null && Number.isFinite(input.aiEstimateDays)) {
    const max = input.location === 'freezer' ? 730 : 365;
    const days = Math.max(1, Math.min(max, Math.round(input.aiEstimateDays)));
    return { date: cap(addDays(input.baseDate, days)), source: 'ai_estimate', confidence: 0.5 };
  }
  return { date: null, source: null, confidence: 0 };
}

// ---------------------------------------------------------------------------
// Receipt line merging
// ---------------------------------------------------------------------------

export interface NormalizedLine {
  raw_text: string;
  name: string;
  brand: string | null;
  quantity: number;
  unit: Unit;
  price_cents: number | null;
  is_food: boolean;
  category: Category;
  storage_location: Location;
  estimated_shelf_life_days: number | null;
  confidence: Record<string, number>;
}

/** Merge duplicate receipt lines into one row with the combined quantity and price. */
export function mergeDuplicateLines(lines: NormalizedLine[]): NormalizedLine[] {
  const out: NormalizedLine[] = [];
  const index = new Map<string, number>();
  for (const line of lines) {
    const key = [line.is_food, line.name.toLowerCase(), line.unit, (line.brand ?? '').toLowerCase()].join('|');
    const at = index.get(key);
    if (at === undefined) {
      index.set(key, out.length);
      out.push({ ...line, confidence: { ...line.confidence } });
      continue;
    }
    const prev = out[at];
    prev.quantity = Math.round((prev.quantity + line.quantity) * 1000) / 1000;
    prev.price_cents =
      prev.price_cents === null && line.price_cents === null ? null : (prev.price_cents ?? 0) + (line.price_cents ?? 0);
    prev.raw_text = `${prev.raw_text} + ${line.raw_text}`.slice(0, 500);
    for (const [k, v] of Object.entries(line.confidence)) {
      prev.confidence[k] = Math.min(prev.confidence[k] ?? v, v);
    }
    if (prev.estimated_shelf_life_days === null) prev.estimated_shelf_life_days = line.estimated_shelf_life_days;
  }
  return out;
}
