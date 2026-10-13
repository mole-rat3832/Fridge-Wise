// User-scoped Supabase client for the edge functions called by the app.
// The client is created with the caller's Authorization header and the publishable key,
// so every query runs as that user and Row Level Security still applies.
import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2.117.3';
import { HttpError } from './http.ts';

export function readKey(jsonEnv: string, legacyEnv: string): string {
  const raw = Deno.env.get(jsonEnv);
  if (raw) {
    try {
      const keys = JSON.parse(raw) as Record<string, string>;
      if (keys.default) return keys.default;
      const first = Object.values(keys)[0];
      if (first) return first;
    } catch {
      // fall through to the legacy variable
    }
  }
  const legacy = Deno.env.get(legacyEnv);
  if (!legacy) throw new Error(`${legacyEnv} is not available`);
  return legacy;
}

export function publishableKey(): string {
  return readKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY');
}

export interface UserContext {
  supabase: SupabaseClient;
  user: User;
}

export async function getUserContext(req: Request): Promise<UserContext> {
  const authorization = req.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) {
    throw new HttpError(401, 'Please sign in again.', 'unauthorized');
  }
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, publishableKey(), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await supabase.auth.getUser(authorization.slice('Bearer '.length));
  if (error || !data.user) {
    throw new HttpError(401, 'Your session has expired. Please sign in again.', 'unauthorized');
  }
  return { supabase, user: data.user };
}

export interface Profile {
  timezone: string;
  locale: string;
  reminder_days_before: number;
}

export async function getProfile(supabase: SupabaseClient, userId: string): Promise<Profile> {
  const { data } = await supabase
    .from('profiles')
    .select('timezone, locale, reminder_days_before')
    .eq('id', userId)
    .maybeSingle();
  return {
    timezone: data?.timezone ?? 'UTC',
    locale: data?.locale ?? 'en-US',
    reminder_days_before: data?.reminder_days_before ?? 2,
  };
}

/** Check the daily Gemini quota by counting ai_usage rows (see claim_ai_quota in the migrations). */
export async function claimQuota(supabase: SupabaseClient, kind: 'scan' | 'command' | 'recipe', refId?: string): Promise<void> {
  const { data, error } = await supabase.rpc('claim_ai_quota', { p_kind: kind, p_ref_id: refId ?? null });
  if (error) throw new Error(`quota check failed: ${error.message}`);
  const res = data as { allowed: boolean; limit: number; resets_at?: string };
  if (!res.allowed) {
    const what = kind === 'scan' ? 'scans' : 'AI requests';
    throw new HttpError(
      429,
      `You've used all ${res.limit} ${what} for today. They reset at midnight. You can still add items by hand.`,
      'daily_limit',
      { limit: res.limit, resets_at: res.resets_at ?? null },
    );
  }
}
