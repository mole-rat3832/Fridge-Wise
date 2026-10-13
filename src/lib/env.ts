// Browser configuration. Everything here is public: the publishable (anon) key only allows
// what Row Level Security allows. The secret / service role key never reaches the browser.
export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL?.trim() || undefined,
  supabaseKey: (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY)?.trim() || undefined,
  turnstileSiteKey: import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() || undefined,
  vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim() || undefined,
};

export const isConfigured = Boolean(env.supabaseUrl && env.supabaseKey);
