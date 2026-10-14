import type { Session, User } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { browserTimeZone, todayIn } from '../lib/dates';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types/app';

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  /** True while the user is following a password-reset link. */
  recovering: boolean;
  today: string;
  timeZone: string;
  locale: string;
  refreshProfile: () => Promise<void>;
  updateProfile: (patch: Partial<Omit<Profile, 'id' | 'created_at' | 'updated_at'>>) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);
  const [tick, setTick] = useState(0);

  // The profile is cached locally so the app still opens when offline.
  const loadProfile = useCallback(async (userId: string) => {
    const key = `fw-profile:${userId}`;
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (!error && data) {
      setProfile(data);
      try {
        localStorage.setItem(key, JSON.stringify(data));
      } catch {
        /* storage unavailable */
      }
      return;
    }
    let cached: Profile | null = null;
    try {
      const raw = localStorage.getItem(key);
      cached = raw ? (JSON.parse(raw) as Profile) : null;
    } catch {
      cached = null;
    }
    setProfile(cached ?? data ?? null);
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session) await loadProfile(data.session.user.id);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      setSession(next);
      if (!next) {
        setProfile(null);
        setRecovering(false);
      } else if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'PASSWORD_RECOVERY') {
        // Defer: calling Supabase inside this callback can deadlock the auth lock.
        setTimeout(() => void loadProfile(next.user.id), 0);
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  // Re-render at local midnight so freshness colors stay right on an open tab.
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const timeZone = profile?.timezone ?? browserTimeZone();
  const locale = profile?.locale ?? (typeof navigator !== 'undefined' ? navigator.language : 'en-US');
  // `tick` changes every minute so `today` rolls over at local midnight.
  const today = useMemo(() => (tick >= 0 ? todayIn(timeZone) : ''), [timeZone, tick]);

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      recovering,
      today,
      timeZone,
      locale,
      refreshProfile: async () => {
        if (session) await loadProfile(session.user.id);
      },
      updateProfile: async (patch) => {
        if (!session) return;
        const { data, error } = await supabase.from('profiles').update(patch).eq('id', session.user.id).select('*').single();
        if (error) throw new Error(error.message);
        setProfile(data);
        try {
          localStorage.setItem(`fw-profile:${session.user.id}`, JSON.stringify(data));
        } catch {
          /* storage unavailable */
        }
      },
      signOut: async () => {
        // Remove this account's offline copies from the device (matters on shared computers).
        const id = session?.user.id;
        await supabase.auth.signOut();
        if (id) {
          try {
            localStorage.removeItem(`fw-items:${id}`);
            localStorage.removeItem(`fw-profile:${id}`);
            for (const k of Object.keys(sessionStorage)) if (k.includes(id)) sessionStorage.removeItem(k);
          } catch {
            /* storage unavailable */
          }
        }
      },
    }),
    [session, profile, loading, recovering, today, timeZone, locale, loadProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
