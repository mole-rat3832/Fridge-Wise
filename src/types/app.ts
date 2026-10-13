import type { Database, Enums, Tables } from './database';

export type FoodItem = Tables<'food_items'>;
export type Profile = Tables<'profiles'>;
export type Scan = Tables<'scans'>;
export type ScanItem = Tables<'scan_items'>;
export type EditLogRow = Tables<'ai_edit_log'>;
export type Recipe = Tables<'recipes'>;
export type UserStatsRow = Database['public']['Views']['user_stats']['Row'];

export type Category = Enums<'food_category'>;
export type StorageLocation = Enums<'storage_location'>;
export type Unit = Enums<'unit'>;
export type ItemStatus = Enums<'item_status'>;
export type FieldSource = Enums<'field_source'>;
export type ScanType = Enums<'scan_type'>;
export type EditSource = Enums<'edit_log_source'>;

export type Freshness = 'red' | 'yellow' | 'green';

/** One proposed operation, in the shape apply_ai_changes expects. */
export interface ProposedOperation {
  op: 'update' | 'mark_used' | 'mark_wasted' | 'create';
  item_id?: string;
  changes?: Record<string, unknown>;
  amount?: number | null;
  item?: Record<string, unknown>;
  reason?: string;
  confidence?: number;
}

export interface PreviewLine {
  item_id: string | null;
  name: string;
  text: string;
  kind: 'update' | 'used' | 'tossed' | 'create' | 'skipped';
}

export interface CommandResponse {
  operations: ProposedOperation[];
  preview: PreviewLine[];
  clarification: string | null;
  problems: string[];
  model: string;
}

export interface ApplyResult {
  batch_id: string | null;
  applied: Array<{ op: string; item_id: string; name: string }>;
  skipped: Array<{ item_id: string; name: string; op?: string; field: string | null; reason: 'locked' | 'not_active' | string }>;
}

export interface UndoResult {
  restored_fields: number;
  removed_items: number;
  skipped: Array<{ item_id: string; name: string; field: string | null; reason: string }>;
}

export interface RecipeIngredient {
  text: string;
  item_id: string | null;
}
