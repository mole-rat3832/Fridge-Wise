// Labels and icons for the enums, plus the AI-writable whitelist (mirrors the database).
import {
  Apple,
  Archive,
  Beef,
  Carrot,
  Cookie,
  CookingPot,
  Croissant,
  CupSoda,
  Egg,
  Fish,
  Milk,
  Package,
  Refrigerator,
  Snowflake,
  type LucideIcon,
} from 'lucide-react';
import type { Category, FieldSource, StorageLocation, Unit } from '../types/app';

export const CATEGORIES: Category[] = [
  'produce', 'dairy', 'meat', 'seafood', 'eggs', 'bakery', 'frozen', 'pantry', 'beverages', 'condiments', 'leftovers', 'other',
];
export const LOCATIONS: StorageLocation[] = ['fridge', 'freezer', 'pantry'];
export const UNITS: Unit[] = ['count', 'g', 'kg', 'oz', 'lb', 'ml', 'l', 'fl_oz', 'gal', 'pack'];

export const CATEGORY_LABEL: Record<Category, string> = {
  produce: 'Produce',
  dairy: 'Dairy',
  meat: 'Meat',
  seafood: 'Seafood',
  eggs: 'Eggs',
  bakery: 'Bakery',
  frozen: 'Frozen',
  pantry: 'Pantry staples',
  beverages: 'Drinks',
  condiments: 'Condiments',
  leftovers: 'Leftovers',
  other: 'Other',
};

export const CATEGORY_ICON: Record<Category, LucideIcon> = {
  produce: Carrot,
  dairy: Milk,
  meat: Beef,
  seafood: Fish,
  eggs: Egg,
  bakery: Croissant,
  frozen: Snowflake,
  pantry: Package,
  beverages: CupSoda,
  condiments: Cookie,
  leftovers: CookingPot,
  other: Apple,
};

export const LOCATION_LABEL: Record<StorageLocation, string> = { fridge: 'Fridge', freezer: 'Freezer', pantry: 'Pantry' };
export const LOCATION_ICON: Record<StorageLocation, LucideIcon> = { fridge: Refrigerator, freezer: Snowflake, pantry: Archive };

export const UNIT_LABEL: Record<Unit, string> = {
  count: 'pcs', g: 'g', kg: 'kg', oz: 'oz', lb: 'lb', ml: 'ml', l: 'L', fl_oz: 'fl oz', gal: 'gal', pack: 'pack',
};

export const SOURCE_LABEL: Record<FieldSource, string> = {
  user: 'You',
  ai_scan: 'Read from scan',
  ai_estimate: 'AI estimate',
  ai_command: 'AI command',
  shelf_life_table: 'USDA FoodKeeper',
  printed_date: 'Printed date',
};

/** Fields the AI may set (same list as private.ai_writable_fields() in the database). */
export const AI_WRITABLE_FIELDS = [
  'name', 'brand', 'category', 'storage_location', 'quantity', 'unit', 'price_cents',
  'barcode', 'purchase_date', 'expiration_date', 'expiration_source', 'opened_at', 'notes',
] as const;

export const FIELD_LABEL: Record<string, string> = {
  name: 'Name',
  brand: 'Brand',
  category: 'Category',
  storage_location: 'Location',
  quantity: 'Quantity',
  unit: 'Unit',
  price_cents: 'Price',
  barcode: 'Barcode',
  purchase_date: 'Purchased',
  expiration_date: 'Expires',
  expiration_source: 'Date source',
  opened_at: 'Opened',
  notes: 'Notes',
  status: 'Status',
  consumed_at: 'Used on',
  wasted_at: 'Tossed on',
};

/** Below this, the review screen highlights a field and says "check this". */
export const LOW_CONFIDENCE = 0.7;

export function formatQuantity(quantity: number, unit: Unit): string {
  const q = Math.round(Number(quantity) * 1000) / 1000;
  return unit === 'count' ? `${q}` : `${q} ${UNIT_LABEL[unit]}`;
}
