// Response schemas. Each one exists twice:
//   * a JSON Schema sent to Gemini as the structured-output schema, and
//   * a Zod schema that validates what actually came back before anything else uses it.
// Unknown keys are stripped by Zod, so only fields that match the schema are ever read.
import { z } from 'npm:zod@4.6.7';
import { AI_WRITABLE_FIELDS, CATEGORIES, LOCATIONS, PRINTED_DATE_TYPES, UNITS } from './normalize.ts';

type JsonSchema = Record<string, unknown>;

// No minimum/maximum here and no maxItems on the long lists below: Gemini rejects a schema
// that is too complex to enforce ("Request contains an invalid argument"), and number bounds
// repeated across every line of a receipt or command did exactly that. The code still clamps
// every confidence to 0..1 and Zod still caps the list lengths.
const num01: JsonSchema = { type: 'number', description: 'From 0 to 1.' };
const nullableString = (description: string): JsonSchema => ({ type: ['string', 'null'], description });
const nullableNumber = (description: string): JsonSchema => ({ type: ['number', 'null'], description });
const confidenceObject = (keys: string[]): JsonSchema => ({
  type: 'object',
  description: 'How sure you are that each field is read correctly, from 0 to 1. Use less than 0.7 when the text is blurry, cut off, heavily abbreviated or guessed.',
  properties: Object.fromEntries(keys.map((k) => [k, num01])),
  required: keys,
});

const zConfidence = (keys: readonly string[]) =>
  z.object(Object.fromEntries(keys.map((k) => [k, z.number()])) as Record<string, z.ZodNumber>).partial();

// ---------------------------------------------------------------------------
// Receipt
// ---------------------------------------------------------------------------
export const RECEIPT_CONFIDENCE_KEYS = [
  'raw_text', 'name', 'brand', 'quantity', 'unit', 'price', 'is_food', 'category', 'storage_location',
] as const;

export const receiptJsonSchema: JsonSchema = {
  type: 'object',
  properties: {
    store_name: nullableString('Store name as printed, or null if not visible.'),
    store_confidence: num01,
    purchase_date_raw: nullableString('The purchase date exactly as printed, e.g. "03/04/26". Null if not visible.'),
    purchase_date: nullableString('Your reading of the purchase date as YYYY-MM-DD, or null.'),
    purchase_date_confidence: num01,
    items: {
      type: 'array',
      description: 'Every purchased line in order. Leave out subtotal, total, payment, change and loyalty-balance lines.',
      items: {
        type: 'object',
        properties: {
          raw_text: { type: 'string', description: 'The line exactly as printed.' },
          name: { type: 'string', description: 'Plain, readable product name without brand or size, e.g. "GV 2% MLK GAL" -> "2% Milk".' },
          brand: nullableString('Brand if printed or obvious from an abbreviation (GV = Great Value), else null.'),
          quantity: nullableNumber('How many units or how much was bought, e.g. 2 for "2 @ 1.99", 2.31 for "2.31 lb". Null if unknown.'),
          unit: { type: 'string', enum: [...UNITS], description: 'Unit for quantity. Use count for individual items.' },
          price: nullableNumber('Line total in the receipt currency (negative for discounts). Null if not printed.'),
          is_food: { type: 'boolean', description: 'False for bags, tax, discounts, coupons, deposits, fees and non-food products.' },
          category: { type: 'string', enum: [...CATEGORIES] },
          storage_location: { type: 'string', enum: [...LOCATIONS], description: 'Where this is normally stored at home.' },
          estimated_shelf_life_days: {
            type: ['integer', 'null'],
            description: 'Typical days this keeps unopened at that storage location, from purchase. Null for non-food.',
          },
          confidence: confidenceObject([...RECEIPT_CONFIDENCE_KEYS]),
        },
        required: [
          'raw_text', 'name', 'brand', 'quantity', 'unit', 'price', 'is_food', 'category',
          'storage_location', 'estimated_shelf_life_days', 'confidence',
        ],
      },
    },
  },
  required: ['store_name', 'store_confidence', 'purchase_date_raw', 'purchase_date', 'purchase_date_confidence', 'items'],
};

export const ReceiptLine = z.object({
  raw_text: z.string().max(1000),
  name: z.string().min(1).max(300),
  brand: z.string().max(300).nullable().optional(),
  quantity: z.number().nullable(),
  unit: z.string().max(40).nullable(),
  price: z.number().nullable(),
  is_food: z.boolean(),
  category: z.enum(CATEGORIES),
  storage_location: z.enum(LOCATIONS),
  estimated_shelf_life_days: z.number().nullable(),
  confidence: zConfidence(RECEIPT_CONFIDENCE_KEYS),
});

export const Receipt = z.object({
  store_name: z.string().max(300).nullable(),
  store_confidence: z.number().optional(),
  purchase_date_raw: z.string().max(200).nullable(),
  purchase_date: z.string().max(60).nullable(),
  purchase_date_confidence: z.number().optional(),
  items: z.array(ReceiptLine).max(150),
});
export type ReceiptOutput = z.infer<typeof Receipt>;

// ---------------------------------------------------------------------------
// Single product / package
// ---------------------------------------------------------------------------
export const PRODUCT_CONFIDENCE_KEYS = [
  'name', 'brand', 'category', 'quantity', 'unit', 'printed_date', 'barcode', 'storage_location',
] as const;

export const productJsonSchema: JsonSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Plain product name without brand or size, e.g. "Greek Yogurt".' },
    brand: nullableString('Brand name, or null.'),
    category: { type: 'string', enum: [...CATEGORIES] },
    quantity: nullableNumber('Package size number, e.g. 32 for "32 oz", 12 for a dozen eggs. Null if not printed.'),
    unit: { type: 'string', enum: [...UNITS] },
    printed_date_raw: nullableString('Any best-by / use-by / sell-by / expiry date exactly as printed. Null if none is visible.'),
    printed_date: nullableString('Your reading of that date as YYYY-MM-DD, or null.'),
    printed_date_type: {
      anyOf: [{ type: 'string', enum: [...PRINTED_DATE_TYPES] }, { type: 'null' }],
      description: 'Which kind of date was printed.',
    },
    barcode: nullableString('Barcode digits only if they are clearly readable under the barcode, else null.'),
    storage_instructions: nullableString('Storage instructions printed on the label, e.g. "Refrigerate after opening". Null if none.'),
    storage_location: { type: 'string', enum: [...LOCATIONS], description: 'Where to store it now.' },
    is_food: { type: 'boolean' },
    estimated_shelf_life_days: {
      type: ['integer', 'null'],
      description: 'Typical days this keeps unopened at that storage location, from today.',
    },
    confidence: confidenceObject([...PRODUCT_CONFIDENCE_KEYS]),
  },
  required: [
    'name', 'brand', 'category', 'quantity', 'unit', 'printed_date_raw', 'printed_date', 'printed_date_type',
    'barcode', 'storage_instructions', 'storage_location', 'is_food', 'estimated_shelf_life_days', 'confidence',
  ],
};

export const Product = z.object({
  name: z.string().min(1).max(300),
  brand: z.string().max(300).nullable(),
  category: z.enum(CATEGORIES),
  quantity: z.number().nullable(),
  unit: z.string().max(40).nullable(),
  printed_date_raw: z.string().max(200).nullable(),
  printed_date: z.string().max(60).nullable(),
  printed_date_type: z.enum(PRINTED_DATE_TYPES).nullable(),
  barcode: z.string().max(60).nullable(),
  storage_instructions: z.string().max(600).nullable(),
  storage_location: z.enum(LOCATIONS),
  is_food: z.boolean(),
  estimated_shelf_life_days: z.number().nullable(),
  confidence: zConfidence(PRODUCT_CONFIDENCE_KEYS),
});
export type ProductOutput = z.infer<typeof Product>;

// ---------------------------------------------------------------------------
// Plain-language commands
// ---------------------------------------------------------------------------
/** What a command may change. expiration_source is set by the database, never by the model. */
export const COMMAND_FIELDS = AI_WRITABLE_FIELDS.filter((f) => f !== 'expiration_source');

export const commandJsonSchema: JsonSchema = {
  type: 'object',
  properties: {
    operations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          op: { type: 'string', enum: ['update', 'mark_used', 'mark_wasted', 'create'] },
          item_ref: nullableString('The ref of an item from the list (e.g. "i3"). Null only for create.'),
          amount: nullableNumber('For mark_used: how much was used, in the item\'s own unit. Null means all of it.'),
          changes: {
            type: 'array',
            description: 'For update: the fields to change. Empty for other operations.',
            items: {
              type: 'object',
              properties: {
                field: { type: 'string', enum: [...COMMAND_FIELDS] },
                value: {
                  type: 'string',
                  description: 'New value as text. Dates as YYYY-MM-DD; opened_at as YYYY-MM-DD or "now"; quantity as a number; price_cents as whole cents.',
                },
              },
              required: ['field', 'value'],
            },
          },
          new_item: {
            type: 'object',
            description: 'For create only.',
            properties: {
              name: { type: 'string' },
              category: { type: 'string', enum: [...CATEGORIES] },
              storage_location: { type: 'string', enum: [...LOCATIONS] },
              quantity: { type: 'number' },
              unit: { type: 'string', enum: [...UNITS] },
              expiration_date: nullableString('YYYY-MM-DD if the user said it, else null.'),
            },
            required: ['name', 'category', 'storage_location', 'quantity', 'unit', 'expiration_date'],
          },
          reason: { type: 'string', description: 'Short explanation shown to the user.' },
          confidence: num01,
        },
        required: ['op', 'item_ref', 'amount', 'changes', 'reason', 'confidence'],
      },
    },
    clarification: nullableString('A short question when the request is ambiguous (e.g. two kinds of milk). When set, operations must be empty.'),
  },
  required: ['operations', 'clarification'],
};

export const CommandOperation = z.object({
  op: z.enum(['update', 'mark_used', 'mark_wasted', 'create']),
  item_ref: z.string().max(20).nullable(),
  amount: z.number().nullable(),
  changes: z.array(z.object({ field: z.enum(COMMAND_FIELDS as [string, ...string[]]), value: z.string().max(1000) })).max(13),
  new_item: z
    .object({
      name: z.string().min(1).max(300),
      category: z.enum(CATEGORIES),
      storage_location: z.enum(LOCATIONS),
      quantity: z.number(),
      unit: z.string().max(40),
      expiration_date: z.string().max(60).nullable(),
    })
    .nullable()
    .optional(),
  reason: z.string().max(1000),
  confidence: z.number(),
});

export const Command = z.object({
  operations: z.array(CommandOperation).max(30),
  clarification: z.string().max(600).nullable(),
});
export type CommandOutput = z.infer<typeof Command>;

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------
export const recipesJsonSchema: JsonSchema = {
  type: 'object',
  properties: {
    recipes: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          time_minutes: { type: 'integer', minimum: 1, maximum: 600 },
          servings: { type: 'integer', minimum: 1, maximum: 20 },
          ingredients: {
            type: 'array',
            minItems: 1,
            maxItems: 25,
            items: {
              type: 'object',
              properties: {
                text: { type: 'string', description: 'Ingredient with amount, e.g. "2 cups baby spinach".' },
                item_ref: nullableString('Ref of the matching item from the list (e.g. "r2"), or null for staples the user may not have listed.'),
              },
              required: ['text', 'item_ref'],
            },
          },
          steps: { type: 'array', minItems: 1, maxItems: 15, items: { type: 'string' } },
        },
        required: ['title', 'time_minutes', 'servings', 'ingredients', 'steps'],
      },
    },
  },
  required: ['recipes'],
};

export const Recipe = z.object({
  title: z.string().min(1).max(300),
  time_minutes: z.number(),
  servings: z.number(),
  ingredients: z.array(z.object({ text: z.string().min(1).max(400), item_ref: z.string().max(20).nullable() })).min(1).max(30),
  steps: z.array(z.string().min(1).max(1200)).min(1).max(20),
});

export const Recipes = z.object({ recipes: z.array(Recipe).min(1).max(3) });
export type RecipesOutput = z.infer<typeof Recipes>;

// ---------------------------------------------------------------------------
// Recipe chat: a short conversation before generating ideas
// ---------------------------------------------------------------------------
export const recipeChatJsonSchema: JsonSchema = {
  type: 'object',
  properties: {
    reply: { type: 'string', description: 'Your answer to the user: 1 to 3 short, friendly sentences. At most one question.' },
    quick_replies: {
      type: 'array',
      maxItems: 4,
      description: '2 to 4 short answers the user could tap next (each under 40 characters), written from the user\'s point of view.',
      items: { type: 'string' },
    },
    brief: nullableString('One line that sums up everything the user wants so far (diet, allergies, cuisine, time, equipment, servings, items to use). Null if nothing yet.'),
    ready: { type: 'boolean', description: 'True when you know enough to generate good recipe ideas.' },
  },
  required: ['reply', 'quick_replies', 'brief', 'ready'],
};

export const RecipeChat = z.object({
  reply: z.string().min(1).max(1200),
  quick_replies: z.array(z.string().max(120)).max(8),
  brief: z.string().max(600).nullable(),
  ready: z.boolean(),
});
export type RecipeChatOutput = z.infer<typeof RecipeChat>;
