// Date helpers. Calendar dates are ISO strings (YYYY-MM-DD) compared as UTC midnights,
// and "today" is always computed in the user's timezone.
import type { Freshness } from '../types/app';

export function todayIn(timeZone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}

/** Days from today until the date (negative when it has passed). */
export function daysLeft(expiration: string | null, today: string): number | null {
  return expiration ? diffDays(expiration, today) : null;
}

/**
 * Status thresholds (in the user's timezone):
 *   red    = expires today or already expired
 *   yellow = expires within reminder_days_before + 1 days
 *   green  = everything else (including items without a date)
 */
export function freshness(expiration: string | null, today: string, reminderDaysBefore: number): Freshness {
  const d = daysLeft(expiration, today);
  if (d === null) return 'green';
  if (d <= 0) return 'red';
  if (d <= reminderDaysBefore + 1) return 'yellow';
  return 'green';
}

export function expiryPhrase(expiration: string | null, today: string): string {
  const d = daysLeft(expiration, today);
  if (d === null) return 'No date';
  if (d < -1) return `Expired ${-d} days ago`;
  if (d === -1) return 'Expired yesterday';
  if (d === 0) return 'Use today';
  if (d === 1) return 'Use by tomorrow';
  if (d < 14) return `${d} days left`;
  if (d < 60) return `${Math.round(d / 7)} weeks left`;
  return `${Math.round(d / 30)} months left`;
}

export function formatDate(iso: string | null | undefined, locale?: string, opts?: Intl.DateTimeFormatOptions): string {
  if (!iso) return '—';
  const d = iso.length === 10 ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, opts ?? { month: 'short', day: 'numeric', year: 'numeric', timeZone: iso.length === 10 ? 'UTC' : undefined }).format(d);
}

export function formatDateTime(iso: string, locale?: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(iso));
}

/** Local calendar date of a timestamp in a timezone. */
export function dateOf(iso: string, timeZone: string): string {
  return todayIn(timeZone, new Date(iso));
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function supportedTimeZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  try {
    const list = intl.supportedValuesOf?.('timeZone');
    if (list && list.length) return list.includes('UTC') ? list : ['UTC', ...list];
  } catch {
    /* fall through */
  }
  return ['UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Asia/Seoul', 'Asia/Tokyo', 'Australia/Sydney'];
}
