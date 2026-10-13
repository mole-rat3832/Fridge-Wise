import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';
import { env } from './env';

// Placeholder values keep the module importable when .env is missing; the app shows a setup
// screen instead of making requests in that case (see App.tsx).
export const supabase = createClient<Database>(env.supabaseUrl ?? 'http://localhost:54321', env.supabaseKey ?? 'missing-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});
