// Active food items of the open kitchen (your own, or a household's), shared by the dashboard,
// "Do I have it?", recipes and the command bar. The last good list is cached per user and kitchen
// in localStorage so the app still shows something offline. In a household kitchen, changes other
// members make arrive live (Supabase Realtime, which applies the same RLS) and on focus.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { FoodItem } from '../types/app';
import { useAuth } from './auth';
import { useKitchen } from './kitchen';

interface ItemsState {
  items: FoodItem[];
  loading: boolean;
  error: string | null;
  /** Set when the list comes from the offline cache. */
  cachedAt: string | null;
  refresh: () => Promise<void>;
}

const ItemsContext = createContext<ItemsState | null>(null);
const cacheKey = (uid: string, kitchen: string | null) => `fw-items:${uid}${kitchen ? `:${kitchen}` : ''}`;

function readCache(uid: string, kitchen: string | null): { items: FoodItem[]; at: string } | null {
  try {
    const raw = localStorage.getItem(cacheKey(uid, kitchen));
    return raw ? (JSON.parse(raw) as { items: FoodItem[]; at: string }) : null;
  } catch {
    return null;
  }
}

function writeCache(uid: string, kitchen: string | null, items: FoodItem[]) {
  try {
    localStorage.setItem(cacheKey(uid, kitchen), JSON.stringify({ items, at: new Date().toISOString() }));
  } catch {
    /* storage full or blocked: the cache is only a convenience */
  }
}

export function ItemsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { activeId } = useKitchen();
  const [items, setItems] = useState<FoodItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  // Answers for a kitchen that is no longer open are dropped.
  const current = useRef<string | null>(activeId);
  useEffect(() => {
    current.current = activeId;
  }, [activeId]);

  const refresh = useCallback(async () => {
    if (!user) return;
    const kitchen = activeId;
    const base = supabase.from('food_items').select('*').eq('status', 'active');
    const { data, error: err } = await (kitchen ? base.eq('household_id', kitchen) : base.is('household_id', null))
      .order('expiration_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
      .limit(1000);
    if (current.current !== kitchen) return;
    if (err) {
      const cached = readCache(user.id, kitchen);
      if (cached) {
        setItems(cached.items);
        setCachedAt(cached.at);
      }
      setError(navigator.onLine ? err.message : null);
    } else {
      setItems(data);
      setCachedAt(null);
      setError(null);
      writeCache(user.id, kitchen, data);
    }
    setLoading(false);
  }, [user, activeId]);

  useEffect(() => {
    if (!user) {
      setItems([]);
      return;
    }
    const cached = readCache(user.id, activeId);
    setItems(cached?.items ?? []);
    setLoading(true);
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
    };
  }, [user, activeId, refresh]);

  // Live updates while a household kitchen is open (other members scan, add and use things).
  // Keyed on the user id and kitchen only, so token refreshes don't tear the subscription down.
  const latestRefresh = useRef(refresh);
  useEffect(() => {
    latestRefresh.current = refresh;
  }, [refresh]);
  const userId = user?.id ?? null;
  useEffect(() => {
    if (!userId || !activeId) return;
    let timer: number | undefined;
    const soon = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void latestRefresh.current(), 400);
    };
    // A unique topic per subscription: a channel being removed can never cancel its replacement.
    const channel = supabase
      .channel(`kitchen:${activeId}:${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'food_items', filter: `household_id=eq.${activeId}` }, soon)
      .subscribe();
    // Safety net if the live connection drops: check again every minute while the tab is visible.
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) void latestRefresh.current();
    }, 60_000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [userId, activeId]);

  const value = useMemo(() => ({ items, loading, error, cachedAt, refresh }), [items, loading, error, cachedAt, refresh]);
  return <ItemsContext.Provider value={value}>{children}</ItemsContext.Provider>;
}

export function useItems(): ItemsState {
  const ctx = useContext(ItemsContext);
  if (!ctx) throw new Error('useItems must be used inside ItemsProvider');
  return ctx;
}
