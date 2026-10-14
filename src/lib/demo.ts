import type { User } from '@supabase/supabase-js';

/**
 * Demo accounts are marked by an admin in the user's app_metadata ({"demo": true}), which users
 * cannot change themselves. Only they see the demo-data controls, and load_demo_data /
 * clear_demo_data refuse every other account.
 */
export function isDemoAccount(user: User | null | undefined): boolean {
  return user?.app_metadata?.demo === true;
}
