// scan-image: read a receipt or a product photo with Gemini and stage the result for review.
//
// POST { scan_id }
// 1. scans.status -> processing
// 2. download the image (as the user, so storage policies apply)
// 3. Gemini (structured JSON) -> Zod validation (retry once) -> normalization
// 4. expiration: printed date > shelf_life table > Gemini estimate
// 5. replace the scan's unconfirmed scan_items, scans.status -> needs_review
// Nothing is written to food_items here; that only happens in confirm_scan after review.
import { encodeBase64 } from 'jsr:@std/encoding@1.0.11/base64';
import { z } from 'npm:zod@4.6.7';
import { AiOutputError, generateJson, UNTRUSTED_INPUT_RULES } from '../_shared/gemini.ts';
import { HttpError, json, readJson, serve } from '../_shared/http.ts';
import { todayIn } from '../_shared/normalize.ts';
import {
  buildScanItems,
  normalizeProduct,
  normalizeReceipt,
  type NormalizedScan,
  type ShelfLifeMatch,
  shelfLifeRequest,
} from '../_shared/scan_normalize.ts';
import { Product, productJsonSchema, Receipt, receiptJsonSchema } from '../_shared/schemas.ts';
import { claimQuota, getProfile, getUserContext } from '../_shared/supabase.ts';

const MAX_ATTEMPTS = 3;

const RECEIPT_PROMPT = `You read photos of grocery receipts for FridgeWise, an app that tracks food at home.
Extract the store name, the purchase date and every purchased line.
For each line give:
- raw_text: the line exactly as printed
- name: a plain product name a person would say, without brand or size ("GV 2% MLK GAL" -> "2% Milk", "BNLS SKNLS CHKN BRST" -> "Chicken Breast")
- brand when printed or obvious from a store-brand abbreviation
- quantity and unit (count for single items; weight or volume when the line is sold by weight or volume; "12CT" eggs = 12 count; a gallon jug = 1 gal)
- price: the line total as a number
- is_food: false for bags, tax, bottle deposits, coupons, discounts, fees and non-food products (paper towels, soap)
- category and the usual home storage_location
- estimated_shelf_life_days: typical days it keeps unopened at that location
- a confidence from 0 to 1 for each field; below 0.7 means the user should check it
Do not include subtotal, total, tender, change, card or loyalty lines.
If the image is not a receipt, return an empty items list.

${UNTRUSTED_INPUT_RULES}`;

const PRODUCT_PROMPT = `You read a photo of one grocery product or package for FridgeWise, an app that tracks food at home.
Extract: the plain product name (no brand or size), brand, category, package size as quantity + unit,
any printed best-by / use-by / sell-by / expiry date (exactly as printed in printed_date_raw, plus your YYYY-MM-DD reading)
and which type it is, barcode digits only if they are clearly readable, storage instructions printed on the label,
where it should be stored now, and a typical unopened shelf life in days for that storage location.
Give a confidence from 0 to 1 for each field; below 0.7 means the user should check it.
If no date is printed, set printed_date_raw, printed_date and printed_date_type to null. Never invent a date.

${UNTRUSTED_INPUT_RULES}`;

const Body = z.object({ scan_id: z.string().uuid() });

serve(async (req) => {
  const body = Body.safeParse(await readJson(req));
  if (!body.success) throw new HttpError(400, 'scan_id is required.', 'bad_request');
  const scanId = body.data.scan_id;

  const { supabase, user } = await getUserContext(req);

  const { data: scan, error: scanError } = await supabase
    .from('scans')
    .select('id, type, image_path, status, attempts, processed_at, created_at')
    .eq('id', scanId)
    .maybeSingle();
  if (scanError) throw new Error(scanError.message);
  if (!scan) throw new HttpError(404, 'Scan not found.', 'not_found');
  if (scan.status === 'confirmed' || scan.status === 'discarded') {
    throw new HttpError(409, 'This scan is already finished.', 'scan_closed');
  }
  if (!scan.image_path) throw new HttpError(409, 'This scan has no image.', 'no_image');
  if (scan.attempts >= MAX_ATTEMPTS) {
    throw new HttpError(429, 'This photo could not be read after several tries. Please add the items by hand.', 'too_many_attempts');
  }

  // Quota: re-processing the same scan does not count twice.
  await claimQuota(supabase, 'scan', scanId);

  // Mark processing. The status filter guards against two concurrent runs.
  const { data: claimed, error: claimError } = await supabase
    .from('scans')
    .update({ status: 'processing', attempts: scan.attempts + 1, error: null })
    .eq('id', scanId)
    .in('status', ['uploaded', 'needs_review', 'failed', 'processing'])
    .select('id')
    .maybeSingle();
  if (claimError) throw new Error(claimError.message);
  if (!claimed) throw new HttpError(409, 'This scan is already finished.', 'scan_closed');

  const fail = async (message: string, raw: unknown = null) => {
    await supabase
      .from('scans')
      .update({ status: 'failed', error: message.slice(0, 500), processed_at: new Date().toISOString(), raw_response: raw === null ? null : { invalid: raw } })
      .eq('id', scanId);
  };

  try {
    const profile = await getProfile(supabase, user.id);
    const ctx = { locale: profile.locale, today: todayIn(profile.timezone) };

    const { data: file, error: downloadError } = await supabase.storage.from('scans').download(scan.image_path);
    if (downloadError || !file) throw new HttpError(404, 'The photo could not be found. Please upload it again.', 'image_missing');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > 6 * 1024 * 1024) throw new HttpError(413, 'The photo is too large.', 'image_too_large');

    const imagePart = { inlineData: { mimeType: 'image/jpeg', data: encodeBase64(bytes) } };
    let normalized: NormalizedScan;
    let model: string;
    let raw: unknown;

    if (scan.type === 'receipt') {
      const result = await generateJson({
        system: RECEIPT_PROMPT,
        parts: [{ text: `Read this receipt. Today is ${ctx.today}. The user's locale is ${ctx.locale}.` }, imagePart],
        jsonSchema: receiptJsonSchema,
        zod: Receipt,
      });
      normalized = normalizeReceipt(result.data, ctx);
      model = result.model;
      raw = result.raw;
    } else {
      const result = await generateJson({
        system: PRODUCT_PROMPT,
        parts: [{ text: `Read this product. Today is ${ctx.today}. The user's locale is ${ctx.locale}.` }, imagePart],
        jsonSchema: productJsonSchema,
        zod: Product,
      });
      normalized = normalizeProduct(result.data, ctx);
      model = result.model;
      raw = result.raw;
    }

    // Expiration step (b): shelf_life table lookup (same matching logic the database uses).
    let shelf: ShelfLifeMatch[] = [];
    if (normalized.candidates.length > 0) {
      const { data: shelfData, error: shelfError } = await supabase.rpc('shelf_life_lookup', {
        p_items: shelfLifeRequest(normalized),
      });
      if (shelfError) throw new Error(shelfError.message);
      shelf = (shelfData ?? []) as ShelfLifeMatch[];
    }
    const rows = buildScanItems(normalized, shelf, ctx);

    // Safe to retry: replace this scan's unconfirmed staging rows.
    const { error: deleteError } = await supabase
      .from('scan_items')
      .delete()
      .eq('scan_id', scanId)
      .is('created_food_item_id', null);
    if (deleteError) throw new Error(deleteError.message);

    if (rows.length > 0) {
      const { error: insertError } = await supabase
        .from('scan_items')
        .insert(rows.map((r) => ({ ...r, scan_id: scanId, user_id: user.id })));
      if (insertError) throw new Error(insertError.message);
    }

    const { error: doneError } = await supabase
      .from('scans')
      .update({
        status: 'needs_review',
        store_name: normalized.store_name,
        purchase_date: normalized.purchase_date,
        model,
        raw_response: raw as Record<string, unknown>,
        error: rows.length === 0 ? 'No items were found in this photo.' : null,
        processed_at: new Date().toISOString(),
      })
      .eq('id', scanId);
    if (doneError) throw new Error(doneError.message);

    return json(req, { scan_id: scanId, status: 'needs_review', item_count: rows.length, model });
  } catch (err) {
    if (err instanceof HttpError) {
      await fail(err.message);
      throw err;
    }
    if (err instanceof AiOutputError) {
      await fail('The AI could not read this photo. You can try again or add the items by hand.', err.raw);
      throw new HttpError(502, 'The AI could not read this photo. You can try again or add the items by hand.', 'scan_failed', {
        can_add_manually: true,
      });
    }
    await fail('Processing failed. You can try again or add the items by hand.');
    throw err;
  }
});
