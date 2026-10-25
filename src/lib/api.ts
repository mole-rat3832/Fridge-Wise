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

/** Fired after every AI call so the usage meters refresh (a call counts even when it fails). */
export const AI_USAGE_EVENT = 'fw-ai-usage';

async function invoke<T>(name: string, body: unknown, opts: { usesAi?: boolean } = {}): Promise<T> {
  if (offline()) throw new ApiError("You're offline. Connect to the internet and try again.", 'offline');
  const { data, error } = await supabase.functions.invoke(name, { body: body as Record<string, unknown> });
  if (opts.usesAi !== false) window.dispatchEvent(new Event(AI_USAGE_EVENT));
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

/** householdId: the open kitchen (null = your own). */
export const aiCommand = (text: string, previous: { request: string; question: string } | undefined, householdId: string | null) =>
  invoke<CommandResponse>('ai-command', { text, previous: previous ?? null, household_id: householdId });

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface RecipeChatReply {
  reply: string;
  quick_replies: string[];
  brief: string | null;
  ready: boolean;
}

/** Recipe ideas from the open kitchen (householdId null = your own), shaped by the conversation (if any). */
export const suggestRecipes = (opts: { servings?: number; conversation?: ChatMessage[]; brief?: string | null; householdId?: string | null } = {}) =>
  invoke<{ recipes: Recipe[]; model: string }>('suggest-recipes', {
    ...(opts.servings ? { servings: opts.servings } : {}),
    ...(opts.conversation?.length ? { conversation: opts.conversation.slice(-12) } : {}),
    ...(opts.brief ? { brief: opts.brief } : {}),
    household_id: opts.householdId ?? null,
  });

/** One turn of the conversation before generating recipes. */
export const recipeChat = (conversation: ChatMessage[], opts: { servings?: number; brief?: string | null; householdId?: string | null } = {}) =>
  invoke<RecipeChatReply>('suggest-recipes', {
    mode: 'chat',
    conversation: conversation.slice(-12),
    ...(opts.servings ? { servings: opts.servings } : {}),
    ...(opts.brief ? { brief: opts.brief } : {}),
    household_id: opts.householdId ?? null,
  });

// Households --------------------------------------------------------------------
export interface HouseholdSummary {
  id: string;
  name: string;
  role: 'owner' | 'member';
  joined_at: string;
  member_count: number;
  item_count: number;
}

export interface HouseholdInvite {
  id: string;
  household_id: string;
  household_name: string;
  invited_by_name: string | null;
  invited_by_email: string | null;
  member_count: number;
  created_at: string;
}

export interface HouseholdMember {
  user_id: string;
  display_name: string | null;
  email: string;
  role: 'owner' | 'member';
  joined_at: string;
  is_you: boolean;
}

export interface HouseholdDetails {
  id: string;
  name: string;
  role: 'owner' | 'member';
  created_at: string;
  members: HouseholdMember[];
  invites: Array<{ id: string; email: string; created_at: string; invited_by_name: string | null }>;
}

/** Needs a fresh CAPTCHA token (checked by the households edge function). */
export const createHousehold = (name: string, captchaToken: string) =>
  invoke<{ id: string; name: string; role: 'owner' }>('households', { action: 'create', name, captcha_token: captchaToken }, { usesAi: false });

/** Needs a fresh CAPTCHA token. The answer never says whether the email has an account. */
export const inviteToHousehold = (householdId: string, email: string, captchaToken: string) =>
  invoke<{ status: 'invited' | 'already_member'; email: string; invite_id?: string }>(
    'households',
    { action: 'invite', household_id: householdId, email, captcha_token: captchaToken },
    { usesAi: false },
  );

export const myHouseholds = () => rpc<HouseholdSummary[]>('my_households');
export const myHouseholdInvites = () => rpc<HouseholdInvite[]>('my_household_invites');
export const householdDetails = (id: string) => rpc<HouseholdDetails>('household_details', { p_household_id: id });
export const respondToInvite = (inviteId: string, accept: boolean) =>
  rpc<{ household_id: string; joined: boolean }>('respond_to_household_invite', { p_invite_id: inviteId, p_accept: accept });
export const revokeInvite = (inviteId: string) => rpc<null>('revoke_household_invite', { p_invite_id: inviteId });
export const leaveHousehold = (id: string) => rpc<{ household_deleted: boolean }>('leave_household', { p_household_id: id });
export const removeHouseholdMember = (id: string, userId: string) =>
  rpc<null>('remove_household_member', { p_household_id: id, p_user_id: userId });
export const renameHousehold = (id: string, name: string) => rpc<null>('rename_household', { p_household_id: id, p_name: name });
export const deleteHousehold = (id: string) => rpc<null>('delete_household', { p_household_id: id });

// RPCs ------------------------------------------------------------------------
/** householdId: the kitchen the scanned items go into (null = your own). */
export const confirmScan = (scanId: string, items: Array<Record<string, unknown>>, householdId: string | null) =>
  rpc<{ batch_id: string; created_item_ids: string[]; created_count: number }>('confirm_scan', {
    p_scan_id: scanId,
    p_items: items as Json,
    p_household_id: householdId,
  });

/** householdId: where "create" operations add items (null = your own kitchen). */
export const applyAiChanges = (
  operations: ProposedOperation[],
  source: Extract<EditSource, 'ai_command' | 'ai_recipe'>,
  model: string | null,
  householdId: string | null,
) =>
  rpc<ApplyResult>('apply_ai_changes', {
    p_batch: { operations } as unknown as Json,
    p_source: source,
    p_model: model,
    p_household_id: householdId,
  });

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

/** Today's AI usage, counted the same way the server enforces the daily limits. */
export interface AiUsage {
  scans_used: number;
  scans_limit: number;
  requests_used: number;
  requests_limit: number;
  /** The next midnight in the user's timezone (ISO timestamp). */
  resets_at: string;
  timezone: string;
}
export const aiUsageToday = () => rpc<AiUsage>('ai_usage_today');

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong. Please try again.';
}
