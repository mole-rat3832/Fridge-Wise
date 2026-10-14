import { useEffect, useSyncExternalStore } from 'react';
import { AI_USAGE_EVENT, aiUsageToday, type AiUsage } from '../lib/api';
import { useAuth } from '../state/auth';

// One shared copy of today's usage for every meter on screen. It refreshes after AI calls,
// when the tab regains focus, once a minute while visible, and right after the daily reset.
let current: { userId: string; usage: AiUsage } | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function load(userId: string): Promise<void> {
  if (inflight) return inflight;
  inflight = aiUsageToday()
    .then((usage) => {
      if (usage) {
        current = { userId, usage };
        emit();
      }
    })
    .catch(() => {
      // Offline or signed out: keep showing the last numbers.
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useAiUsage(): AiUsage | null {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const snapshot = useSyncExternalStore(subscribe, () => current);

  useEffect(() => {
    if (!userId) return;
    const refresh = () => {
      if (document.visibilityState === 'visible') void load(userId);
    };
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener(AI_USAGE_EVENT, refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(AI_USAGE_EVENT, refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [userId]);

  // Reload just after midnight so the meters drop back to zero on an open tab.
  const resetsAt = snapshot?.userId === userId ? snapshot.usage.resets_at : null;
  useEffect(() => {
    if (!userId || !resetsAt) return;
    const wait = new Date(resetsAt).getTime() - Date.now() + 2000;
    if (wait <= 0 || wait > 2 ** 31 - 1) return;
    const t = window.setTimeout(() => void load(userId), wait);
    return () => window.clearTimeout(t);
  }, [userId, resetsAt]);

  return snapshot && snapshot.userId === userId ? snapshot.usage : null;
}

/** "12:00 AM EDT": the reset time, shown in the user's own timezone. */
export function resetTimeLabel(usage: AiUsage, locale?: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: usage.timezone, timeZoneName: 'short' }).format(
      new Date(usage.resets_at),
    );
  } catch {
    return 'midnight';
  }
}

/** "4 h 12 min" until the next reset. */
export function untilReset(usage: AiUsage, now = Date.now()): string {
  const mins = Math.max(0, Math.ceil((new Date(usage.resets_at).getTime() - now) / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
