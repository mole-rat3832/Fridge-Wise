// Typed wrappers around the RPCs and edge functions. Every AI change goes through these:
// edge function (proposal) -> user confirms in the UI -> RPC (applies + logs in one transaction).
import { FunctionsHttpError } from '@supabase/supabase-js';
import type { ApplyResult, CommandResponse, EditSource, ProposedOperation, Recipe, UndoResult } from '../types/app';
import type { Json } from '../types/database';
import { supabase } from './supabase';

export class ApiError extends Error {
  readonly code: string;
  readonly extra: Record<string, unknown>;

  constructor(message: string, code = 'error', extra: Record<string, unknown> = {}) {
    super(message);
    this.code = code;
    this.extra = extra;
  }
}

function offline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

async function invoke<T>(name: string, body: unknown): Promise<T> {
  if (offline()) throw new ApiError("You're offline. Connect to the internet and try again.", 'offline');
  const { data, error } = await supabase.functions.invoke(name, { body: body as Record<string, unknown> });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      let payload: { error?: string; code?: string } & Record<string, unknown> = {};
      try {
        payload = await error.context.json();
      } catch {
        /* not JSON */
      }
      throw new ApiError(payload.error ?? 'Something went wrong. Please try again.', payload.code ?? 'error', payload);
    }
    throw new ApiError('Could not reach FridgeWise. Check your connection and try again.', 'network');
  }
  return data as T;
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  if (offline()) throw new ApiError("You're offline. Connect to the internet and try again.", 'offline');
  // The generated types cover every function; this helper keeps call sites short.
  const { data, error } = await (supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>)(fn, args);
  if (error) throw new ApiError(error.message, error.code ?? 'db_error');
  return data as T;
}

// Edge functions --------------------------------------------------------------
export const scanImage = (scanId: string) =>
  invoke<{ scan_id: string; status: string; item_count: number; model: string }>('scan-image', { scan_id: scanId });

export const aiCommand = (text: string, previous?: { request: string; question: string }) =>
  invoke<CommandResponse>('ai-command', { text, previous: previous ?? null });

export const suggestRecipes = (servings?: number) => invoke<{ recipes: Recipe[]; model: string }>('suggest-recipes', servings ? { servings } : {});

// RPCs ------------------------------------------------------------------------
export const confirmScan = (scanId: string, items: Array<Record<string, unknown>>) =>
  rpc<{ batch_id: string; created_item_ids: string[]; created_count: number }>('confirm_scan', { p_scan_id: scanId, p_items: items as Json });

export const applyAiChanges = (operations: ProposedOperation[], source: Extract<EditSource, 'ai_command' | 'ai_recipe'>, model: string | null) =>
  rpc<ApplyResult>('apply_ai_changes', { p_batch: { operations } as unknown as Json, p_source: source, p_model: model });

export const undoBatch = (batchId: string) => rpc<UndoResult>('undo_ai_batch', { p_batch_id: batchId });

export const recordUse = (itemId: string, amount?: number | null) =>
  rpc<{ batch_id: string; status: string; quantity: number }>('record_item_use', { p_item_id: itemId, p_amount: amount ?? null });

export const recordWaste = (itemId: string) => rpc<{ batch_id: string; status: string }>('record_item_waste', { p_item_id: itemId });

export const shelfLifeLookup = (items: Array<{ name: string; category: string; storage_location: string; opened?: boolean }>) =>
  rpc<Array<{ index: number; days: number | null; keyword: string | null; matched_by: 'keyword' | 'category' | null }>>('shelf_life_lookup', {
    p_items: items as unknown as Json,
  });

export const loadDemoData = () => rpc<{ active_items: number; history_items: number }>('load_demo_data');
export const clearDemoData = () => rpc<number>('clear_demo_data');
export const deleteMyAccount = () => rpc<null>('delete_my_account');

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong. Please try again.';
}
