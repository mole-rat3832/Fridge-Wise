// Which kitchen is open: your own (activeId = null) or a household you are in. Every page that
// works on food items (dashboard, add, scan review, commands, recipes, "Do I have it?", stats)
// follows it. The choice is remembered per user on this device.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { myHouseholdInvites, myHouseholds, type HouseholdInvite, type HouseholdSummary } from '../lib/api';
import { useAuth } from './auth';

interface KitchenState {
  households: HouseholdSummary[];
  invites: HouseholdInvite[];
  /** null = the user's own kitchen. */
  activeId: string | null;
  active: HouseholdSummary | null;
  /** "My kitchen" or the household's name. */
  kitchenName: string;
  loaded: boolean;
  setActive: (id: string | null) => void;
  refresh: () => Promise<void>;
}

const KitchenContext = createContext<KitchenState | null>(null);
const storageKey = (uid: string) => `fw-kitchen:${uid}`;
const listKey = (uid: string) => `fw-households:${uid}`;
export const OWN_KITCHEN = 'My kitchen';

function readList(uid: string): { households: HouseholdSummary[]; invites: HouseholdInvite[] } | null {
  try {
    const raw = localStorage.getItem(listKey(uid));
    return raw ? (JSON.parse(raw) as { households: HouseholdSummary[]; invites: HouseholdInvite[] }) : null;
  } catch {
    return null;
  }
}

function writeList(uid: string, households: HouseholdSummary[], invites: HouseholdInvite[]) {
  try {
    localStorage.setItem(listKey(uid), JSON.stringify({ households, invites }));
  } catch {
    /* the cache is only for offline use */
  }
}

function readActive(uid: string): string | null {
  try {
    return localStorage.getItem(storageKey(uid));
  } catch {
    return null;
  }
}

function writeActive(uid: string, id: string | null) {
  try {
    if (id) localStorage.setItem(storageKey(uid), id);
    else localStorage.removeItem(storageKey(uid));
  } catch {
    /* storage blocked: the choice just isn't remembered */
  }
}

export function KitchenProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [households, setHouseholds] = useState<HouseholdSummary[]>([]);
  const [invites, setInvites] = useState<HouseholdInvite[]>([]);
  const [activeId, setActiveId] = useState<string | null>(() => (user ? readActive(user.id) : null));
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const [h, i] = await Promise.all([myHouseholds(), myHouseholdInvites()]);
      setHouseholds(h);
      setInvites(i);
      writeList(user.id, h, i);
      setLoaded(true);
      // Left or removed from the open household: fall back to your own kitchen.
      setActiveId((current) => {
        if (current && !h.some((x) => x.id === current)) {
          writeActive(user.id, null);
          return null;
        }
        return current;
      });
    } catch {
      /* offline: keep the cached list */
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setHouseholds([]);
      setInvites([]);
      setActiveId(null);
      setLoaded(false);
      return;
    }
    setActiveId(readActive(user.id));
    const cached = readList(user.id);
    setHouseholds(cached?.households ?? []);
    setInvites(cached?.invites ?? []);
    setLoaded(Boolean(cached));
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
    };
  }, [user, refresh]);

  const setActive = useCallback(
    (id: string | null) => {
      if (!user) return;
      writeActive(user.id, id);
      setActiveId(id);
    },
    [user],
  );

  const value = useMemo<KitchenState>(() => {
    const active = households.find((h) => h.id === activeId) ?? null;
    return {
      households,
      invites,
      // Until the list has loaded, trust the remembered choice so the right items load at once.
      activeId: loaded ? (active?.id ?? null) : activeId,
      active,
      kitchenName: active?.name ?? (activeId && !loaded ? '' : OWN_KITCHEN),
      loaded,
      setActive,
      refresh,
    };
  }, [households, invites, activeId, loaded, setActive, refresh]);

  return <KitchenContext.Provider value={value}>{children}</KitchenContext.Provider>;
}

export function useKitchen(): KitchenState {
  const ctx = useContext(KitchenContext);
  if (!ctx) throw new Error('useKitchen must be used inside KitchenProvider');
  return ctx;
}
