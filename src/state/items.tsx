// Active food items, shared by the dashboard, "Do I have it?", recipes and the command bar.
// The last good list is cached per user in localStorage so the app still shows something offline.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { FoodItem } from '../types/app';
import { useAuth } from './auth';

interface ItemsState {
  items: FoodItem[];
  loading: boolean;
  error: string | null;
  /** Set when the list comes from the offline cache. */
  cachedAt: string | null;
  refresh: () => Promise<void>;
}

const ItemsContext = createContext<ItemsState | null>(null);
const cacheKey = (uid: string) => `fw-items:${uid}`;

function readCache(uid: string): { items: FoodItem[]; at: string } | null {
  try {
    const raw = localStorage.getItem(cacheKey(uid));
    return raw ? (JSON.parse(raw) as { items: FoodItem[]; at: string }) : null;
  } catch {
    return null;
  }
}

function writeCache(uid: string, items: FoodItem[]) {
  try {
    localStorage.setItem(cacheKey(uid), JSON.stringify({ items, at: new Date().toISOString() }));
  } catch {
    /* storage full or blocked: the cache is only a convenience */
  }
}

export function ItemsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [items, setItems] = useState<FoodItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    const { data, error: err } = await supabase
      .from('food_items')
      .select('*')
      .eq('status', 'active')
      .order('expiration_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
      .limit(1000);
    if (err) {
      const cached = readCache(user.id);
      if (cached) {
        setItems(cached.items);
        setCachedAt(cached.at);
      }
      setError(navigator.onLine ? err.message : null);
    } else {
      setItems(data);
      setCachedAt(null);
      setError(null);
      writeCache(user.id, data);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) {
      setItems([]);
      return;
    }
    const cached = readCache(user.id);
    if (cached) setItems(cached.items);
    setLoading(true);
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
    };
  }, [user, refresh]);

  const value = useMemo(() => ({ items, loading, error, cachedAt, refresh }), [items, loading, error, cachedAt, refresh]);
  return <ItemsContext.Provider value={value}>{children}</ItemsContext.Provider>;
}

export function useItems(): ItemsState {
  const ctx = useContext(ItemsContext);
  if (!ctx) throw new Error('useItems must be used inside ItemsProvider');
  return ctx;
}
